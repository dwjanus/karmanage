import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import mongo from 'botkit-storage-mongo'
import config from './config.js'

const storage = mongo({ mongoUri: config('MONGODB_URI') })

async function scoreboard (leaderKarma, teamKarma) {
  try {
    console.log('--> building scoreboard')
    let leaderboard = await buildLeaderboard(leaderKarma)
    let scoreboard = await buildScoreboard(teamKarma)
    leaderboard.attachments.push(scoreboard)
    console.log(`--> built\n${util.inspect(leaderboard)}`)
    return leaderboard
  } catch (err) {
    console.log(err)
  }
}

function updateScoreboard (user) {
  storage.teams.get(user.team_id, (err, team) => {
    if (err) console.log(err)
    let teamKarma = team.scoreboard.karma
    console.log('Updating Scoreboard')
    let checkScore = _.findIndex(teamKarma, (o) => { return o.name == user.name })
    console.log('checkScore: ' + checkScore)
    if (checkScore == -1) teamKarma.push({name: user.name, score: user.karma})
    else {
      if (teamKarma[checkScore]) checkScore = _.findLastIndex(teamKarma, (o) => { o.karma !== null || undefined }) + 1
      console.log('new checkScore: ' + checkScore)
      teamKarma[checkScore].score = user.karma
    }
    team.scoreboard.karma = _.reverse(_.sortBy(teamKarma, [(o) => { return o.score }]))
    console.log('Scoreboard Sorted by score:\n' + util.inspect(team.scoreboard.karma))
    storage.teams.save(team)
  })
}

function addKarma (user) {
  storage.users.get(user, (err, res) => {
    if (err) console.log(err)
    console.log('Stored User: ' + util.inspect(res))
    res.karma = _.toInteger(res.karma) + 1
    storage.users.save(res)
    updateScoreboard(res)
  })
}

function subtractKarma (user) {
  storage.users.get(user, (err, res) => {
    if (err) console.log(err)
    console.log('Stored User: ' + util.inspect(res))
    res.karma = _.toInteger(res.karma) - 1
    storage.users.save(res)
    updateScoreboard(res)
  })
}

function buildLeaderboard (leaderKarma) {
  console.log('--> building leaderboard')
  const colors = [
    '#E5E4E2',
    '#D4AF37',
    '#C0C0C0',
    '#CD7F32',
    '#CF5300'
  ]
  return new Promise((resolve, reject) => {
    if (!leaderKarma) reject(leaderKarma)
    let output = { attachments: [] }
    let i = 0
    _.forEach(leaderKarma, (value) => {
      output.attachments.push({text: `${i + 1}: ${value.name} - ${value.score}`, color: colors[i]})
      i++
    })
    resolve(output)
  })
}

function buildScoreboard (teamKarma) {
  console.log('--> building loserboard')
  return new Promise((resolve, reject) => {
    if (!teamKarma) reject(teamKarma)
    let output = {text: '', color: '#0067B3'}
    _.forEach(teamKarma, (value) => {
      output.text += `${value.name}: ${value.score}\n`
    })
    resolve(output)
  })
}

async function processUsers (rawIds) {
  try {
    let ids = await mapIds(rawIds)
    return ids
  } catch (err) {
    console.log(err)
  }
}

function mapIds (rawIds) {
  return new Promise((resolve, reject) => {
    let ids = _.map(rawIds, processRawId)
    resolve(ids)
  })
}

function processRawId (rawId) {
  return _.toString(rawId).substring(2, 11)
}

module.exports = {
  scoreboard,
  addKarma,
  subtractKarma,
  processUsers,
  updateScoreboard
}
