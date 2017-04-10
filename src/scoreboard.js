import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import mongo from 'botkit-storage-mongo'
import config from './config.js'

const storage = mongo({ mongoUri: config('MONGODB_URI') })

const buildScoreboard = (team) => {
  return new Promise((resolve, reject) => {
    console.log(`\n... building scoreboard for team ${team.id}...`)
    // orderedboard = _.orderBy(team.scoreboard, ['karma', 'name'], ['desc', 'asc'])
    // console.log(`[buildScoreboard] ** ordered scoreboard **\n${util.inspect(orderedboard)}`)
    //
    // team.scoreboard = orderedboard
    // storage.teams.save(team)
    const leaders = _.slice(team.scoreboard, 0, 5)
    const losers = _.slice(team.scoreboard, 5, team.scoreboard.length)

    console.log(`[buildScoreboard] ** got our leaders and losers **\nLeaders:\n${util.inspect(leaders)}\nLosers:\n${util.inspect(losers)}`)

    return Promise.join(buildLeaderboard(leaders), buildLoserboard(losers), (leaderboard, loserboard) => {
      leaderboard.attachments = leaderboard.attachments.concat(loserboard)
      console.log(`[buildScoreboard] leaderboard before resolve:\n${util.inspect(leaderboard)}`)
      return resolve(leaderboard)
    })
    .catch((err) => {
      if (err) return reject(err)
    })
  })
}

const updateScoreboard = (user) => {
  // return new Promise((resolve, reject) => {
    storage.teams.get(user.team_id, (err, team) => {
      if (err) console.log(err) // reject(err)
      console.log(`Updating scoreboard for Team ${user.team_id} with user ${user.fullName} - ${user.karma}`)
      let check = _.findIndex(team.scoreboard, (o) => { return o.name == user.fullName })
      console.log('check: ' + check)
      if (check === -1 && user.fullName !== '' || ' ' || 'slackbot' || null || undefined) {
        console.log(`User is not on the board -- pushing now`)
        team.scoreboard.push({ karma: user.karma, name: user.fullName })
      }
      else team.scoreboard[check].karma = user.karma
      team.scoreboard = _.orderBy(team.scoreboard, ['karma', 'name'], ['desc', 'asc'])
      console.log(`[scoreboard] New Scoreboard:\n${util.inspect(team.scoreboard)}\n`)
      storage.teams.save(team)
      // resolve(team.scoreboard)
    // })
  })
}

const addKarma = (userId) => {
  storage.users.get(userId, (err, user) => {
    if (err) console.log(err)
    console.log('Stored User:\n' + util.inspect(user))
    user.karma = _.toInteger(user.karma) + 1
    storage.users.save(user)
    console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma} - updating now...`)
    updateScoreboard(user)
  })
}

const subtractKarma = (userId) => {
  storage.users.get(userId, (err, user) => {
    if (err) console.log(err)
    console.log('Stored User:\n' + util.inspect(user))
    user.karma = _.toInteger(user.karma) - 1
    storage.users.save(user)
    console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma} - updating now...`)
    updateScoreboard(user)
  })
}

const buildLeaderboard = (leaderKarma) => {
  console.log('--> building leaderboard')
  const colors = [
    '#E5E4E2',
    '#D4AF37',
    '#C0C0C0',
    '#CD7F32',
    '#CF5300'
  ]
  let lastValue
  return new Promise((resolve, reject) => {
    if (!leaderKarma) reject(leaderKarma)
    let output = { attachments: [] }
    let i = 0
    _.forEach(leaderKarma, (value) => {
      output.attachments.push({text: `${i + 1}: ${value.name} - ${value.karma}`, color: colors[i]})
      i++
    })
    resolve(output)
  })
}

const buildLoserboard = (loserKarma) => {
  console.log('--> building loserboard')
  return new Promise((resolve, reject) => {
    if (!loserKarma) reject(loserKarma)
    let output = {text: '', color: '#0067B3'}
    let i = 6
    _.forEach(loserKarma, (value) => {
      output.text += `${i}: ${value.name}: ${value.karma}\n`
      i++
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

const mapIds = (rawIds) => {
  return new Promise((resolve, reject) => {
    let ids = _.map(rawIds, processRawId)
    resolve(ids)
  })
}

const processRawId = (rawId) => {
  return _.toString(rawId).substring(2, 11)
}

module.exports = {
  buildScoreboard,
  addKarma,
  subtractKarma,
  processUsers,
  updateScoreboard
}
