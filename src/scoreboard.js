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
    console.log(`Updating Scoreboard with user ${user.fullName} - ${user.karma}`)
    console.log(`Current Scoreboard:\n${util.inspect(team.scoreboard.karma)}\n`)
    let checkScore = _.findIndex(team.scoreboard.karma, (o) => { return o.name === user.name })
    console.log('checkScore: ' + checkScore)
    if (checkScore === -1 && (user.fullName !== null || '')) team.scoreboard.karma.push({ score: user.karma, name: user.fullName })
    else team.scoreboard.karma[checkScore].score = user.karma
    console.log(`--> Now it looks like:\n${util.inspect(team.scoreboard.karma)}\n`)
    const teamKarma = _.orderBy(team.scoreboard.karma, ['score', 'name'], ['desc', 'asc'])
    console.log('--> Scoreboard Sorted by score:\n' + util.inspect(teamKarma) + '\n')
    team.scoreboard.karma = teamKarma
    storage.teams.save(team)
  })
}

function addKarma (userId) {
  storage.users.get(userId, (err, user) => {
    if (err) console.log(err)
    console.log('Stored User: ' + util.inspect(user))
    user.karma = _.toInteger(user.karma) + 1
    storage.users.save(user)
    updateScoreboard(user)
  })
}

function subtractKarma (userId) {
  storage.users.get(userId, (err, user) => {
    if (err) console.log(err)
    console.log('Stored User: ' + util.inspect(user))
    user.karma = _.toInteger(user.karma) - 1
    storage.users.save(user)
    updateScoreboard(user)
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
