import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import mongo from './db.js'
import config from './config.js'

const storage = mongo({ mongoUri: config('MONGODB_URI') })

const dbScoreboard = (teamId) => {
  return new Promise((resolve, reject) => {
    if (teamId === undefined) return reject()
    let index = 0
    let scoreboard = [ { scores: [] } ]
    storage.scores.get(teamId, (err, scores) => {
      if (err) return reject(err)
      for (let i in scores.ordered) {
        if (_.isEmpty(scoreboard[index].scores)) {
          scoreboard[index].scores.push(scores.ordered[i])
        } else {
          if (scoreboard[index].scores[0].karma === scores.ordered[i].karma) {
            scoreboard[index].scores.push(scores.ordered[i])
          } else {
            index++
            scoreboard[index] = { scores: [] }
            scoreboard[index].scores.push(scores.ordered[i])
          }
        }
        scores.ordered[i].rank_index = index
        if ( scores.ordered[i].rankd_id) delete scores.ordered[i].rankd_id
        storage.scores.save(scores)
      }
      Promise.all(scoreboard).then(resolve(scoreboard)).catch((err) => reject(err))
    })
  })
}

// maybe we can find a way to break this up by location as well?
// scoreboard-local and scoreboard ?
const buildScoreboard = (team) => {
  return new Promise((resolve, reject) => {
    console.log(`\n... building scoreboard for team ${team.id}...`)
    const leaders = _.slice(team.scoreboard, 0, 3)
    const losers = _.slice(team.scoreboard, 3, team.scoreboard.length)
    return Promise.join(buildLeaderboard(leaders), buildLoserboard(losers), (leaderboard, loserboard) => {
      if (loserboard.attachments) leaderboard.attachments = leaderboard.attachments.concat(loserboard.attachments)
      return resolve(leaderboard)
    })
    .catch((err) => {
      if (err) reject(err)
    })
  })
}

// once we have more scores in here we will make it display the leaders and the losers will
// be the 'nearby' array
const buildLimitedScoreboard = (team, user) => {
  return new Promise((resolve, reject) => {
    console.log(`\n... building limited scoreboard for user ${user.id} in team ${team.id}...`)
    storage.scores.get(team.id, (err, scores) => {
      if (err) return reject(err)
      const found = _.findIndex(scores.ordered, (o) => { return o.user_id == user.id })
      if (scores.ordered[found].rank_index <= 2) {
        return buildScoreboard(team).then((scoreboard) => {
          return resolve(scoreboard)
        })
        .catch((err) => {
          if (err) reject(err)
        })
      }

      const start = found >= 5 ? found - 2 : 3
      const end = found + 3 <= scores.ordered.length ? found + 3 : scores.ordered.length
      const nearbyScores = _.slice(scores.ordered, start, end)
      const leaders = _.slice(team.scoreboard, 0, 3)
      console.log(`--> [scoreboard] buildLimitedScoreboard\n----> start: ${start}  end: ${end}`)
      console.log(`----> nearbyScores: ${util.inspect(nearbyScores)}\n----> leaders: ${util.inspect(leaders)}`)
      return Promise.join(buildLeaderboard(leaders), buildNearby(nearbyScores, user), (leaderboard, nearbyboard) => {
        console.log(`--> got leaderboard!\n${util.inspect(leaderboard)}\n--> got nearby!\n${util.inspect(nearbyboard)}`)
        leaderboard.attachments = leaderboard.attachments.concat(nearbyboard.attachments)
        console.log(`\n--> final leaderboard:\n${util.inspect(leaderboard)}`)
        return resolve(leaderboard)
      })
      .catch((err) => {
        if (err) reject(err)
      })
    })
  })
}

const updateScores = (user) => {
  storage.scores.get(user.team_id, (err, scores) => {
    if (err) console.log(err)
    let found = _.findIndex(scores.ordered, (o) => { return o.user_id == user.id })
    scores.ordered[found].karma = user.karma
    scores.ordered = _.orderBy(scores.ordered, ['karma', 'name'], ['desc', 'asc'])
    storage.scores.save(scores)
    storage.teams.get(user.team_id, (err, team) => {
      if (err) console.log(err)
      dbScoreboard(team.id).then((ordered) => {
        team.scoreboard = ordered
        storage.teams.save(team)
      })
    })
  })
}

const addKarma = (user) => {
  user.karma = _.toInteger(user.karma) + 1
  storage.users.save(user)
  updateScores(user)
  console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma}`)
}

const subtractKarma = (user) => {
  user.karma = _.toInteger(user.karma) - 1
  storage.users.save(user)
  updateScores(user)
  console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma} - updating now...`)
}

const buildLeaderboard = (leaderArray) => {
  const colors = [
    '#D5BF37',
    '#E5E4E2',
    '#CD7F32'
    // '#CF5300',
    // '#952A2A'
  ]
  return new Promise((resolve, reject) => {
    if (!leaderArray) reject(new Error('invalid leader array'))
    let output = { attachments: [] }
    for (let i = 0; i < leaderArray.length; i++) {
      output.attachments.push({ text: `${i + 1}: `, color: colors[i] })
      for (let s of leaderArray[i].scores) {
        if (s === leaderArray[i].scores[0]) output.attachments[i].text += `${s.name} - ${s.karma}\n`
        else output.attachments[i].text += `     ${s.name} - ${s.karma}\n`
      }
    }
    Promise.all(output.attachments).then(resolve(output)).catch((err) => reject(err))
  })
}

const buildLoserboard = (loserArray) => {
  return new Promise((resolve, reject) => {
    let output = { attachments: [] }
    if (!loserArray || _.isEmpty(loserArray)) resolve(output)
    for (let i = 3; i < loserArray.length; i++) { // i was initially = 6 (?)
      output.attachments.push({ text: `${i + 1}: `, color: '#0067B3' })
      for (let s of loserArray[i].scores) {
        if (s === loserArray[i].scores) output.attachments[i].text += `${s.name} - ${s.karma}\n`
        else output.attachments[i].text += `     ${s.name} - ${s.karma}\n`
      }
    }
    Promise.all(output.attachments).then(resolve(output)).catch((err) => reject(err))
  })
}

const buildNearby = (nearbyArray, user) => {
  const colors = [
    '#05BF37',
    '#F5E4E2',
    '#FF7F32',
    '#CF53F0',
    '#650A0C'
  ]
  return new Promise((resolve, reject) => {
    let c = 0
    let output = { attachments: [] }
    if (!nearbyArray || _.isEmpty(nearbyArray)) resolve(output)
    for (let i = 0; i < nearbyArray.length; i++) {
      if (i == 0 || nearbyArray[i].karma < nearbyArray[i - 1].karma) {
        if (i > 0) c += 1
        if (nearbyArray[i].user_id == user.id) {
          output.attachments.push({
            text: `${nearbyArray[i].rank_index + 1}: *${nearbyArray[i].name}* - *${nearbyArray[i].karma}*\n`,
            color: colors[c],
            mrkdwn_in: ['text']
          })
        } else {
          output.attachments.push({
            text: `${nearbyArray[i].rank_index + 1}: ${nearbyArray[i].name} - ${nearbyArray[i].karma}\n`,
            color: colors[c],
            mrkdwn_in: ['text']
          })
        }
      } else {
        if (nearbyArray[i].user_id == user.id) {
          output.attachments[c].text += `     *${nearbyArray[i].name}* - *${nearbyArray[i].karma}*\n`
        } else output.attachments[c].text += `     ${nearbyArray[i].name} - ${nearbyArray[i].karma}\n`
      }
    }
    Promise.all(output.attachments).then(resolve(output)).catch((err) => reject(err))
  })
}

const processUsers = (rawIds) => {
  return new Promise((resolve, reject) => {
    if (!rawIds) reject(new Error('no ids to process'))
    let ids = _.map(rawIds, processRawId)
    resolve(ids)
  })
}

const processRawId = (rawId) => {
  return _.toString(rawId).substring(2, 11)
}

module.exports = {
  dbScoreboard,
  buildScoreboard,
  buildLimitedScoreboard,
  addKarma,
  subtractKarma,
  processUsers
}
