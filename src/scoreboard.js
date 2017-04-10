import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import mongo from 'botkit-storage-mongo'
import config from './config.js'

const storage = mongo({ mongoUri: config('MONGODB_URI') })

const buildScoreboard = (team) => {
  return new Promise((resolve, reject) => {
    console.log(`\n... building scoreboard for team ${team.id}...`)

    orderedboard = _.orderBy(team.scoreboard, ['karma', 'name'], ['desc', 'asc'])

    console.log(`[buildScoreboard] ** ordered scoreboard **\n${util.inspect(orderedboard)}`)

    team.scoreboard = orderedboard
    storage.teams.save(team)
    const leaders = _.slice(orderedboard, 0, 5)
    const losers = _.slice(orderedboard, 5, orderedboard.length)

    console.log(`[buildScoreboard] ** got our leaders and losers **\nLeaders:\n${util.inspect(leaders)}\nLosers:\n${util.inspect(losers)}`)

    return Promise.join(buildLeaderboard(leaders), buildLoserboard(losers), (leaderboard, loserboard) => {
      leaderboard.attachments.push(loserboard)
      return resolve(leaderboard)
    })
    .catch((err) => {
      if (err) return reject(err)
    })
  })
}

// takes array of users and updates their scores
const updateTeam = (team) => {
  return new Promise.map((resolve, reject) => {
    console.log(`updating team:\n${util.inspect(team)}`)
    let 
    for(let t of team) {
      updateScoreboard(t).then()
    }
  })
}

const updateScoreboard = (user) => {
  return new Promise((resolve, reject) => {
    storage.teams.get(user.team_id, (err, team) => {
      if (err) reject(err)
      console.log(`Updating scoreboard for Team ${user.team_id} with user ${user.fullName} - ${user.karma}`)
      console.log(`Current Scoreboard:\n${util.inspect(team.scoreboard)}\n`)
      let board = team.scoreboard
      let check = _.findIndex(board, (o) => { return o.fullName == user.name })
      console.log('check: ' + check)
      if (check === -1 && user.fullName !== '' || ' ' || 'slackbot' || null || undefined) {
        console.log(`User is not on the board -- pushing now`)
        board.push({ karma: user.karma, name: user.fullName })
      }
      else board[check].karma = user.karma
      console.log(`--> Now it looks like:\n${util.inspect(board)}\n`)
      team.scoreboard = _.orderBy(board, ['karma', 'name'], ['desc', 'asc'])
      console.log('--> Scoreboard Sorted by score:\n' + util.inspect(board) + '\n')
      storage.teams.save(team)
      resolve(team.scoreboard)
    })
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
