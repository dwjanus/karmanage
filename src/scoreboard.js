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

      let user_index = scores.ordered[found].rank_index
      const start = user_index >= 5 ? user_index - 2 : 3
      const end = start + 3 <= team.scoreboard.length ? start + 3 : team.scoreboard.length
      const nearbyScores = _.slice(team.scoreboard, start, end)
      user_index = user_index - start // create adjusted user index based on starting point in array
      const leaders = _.slice(team.scoreboard, 0, 3)
      console.log(`--> [scoreboard] buildLimitedScoreboard\n----> start: ${start}  end: ${end}`)
      console.log(`----> nearbyScores: ${util.inspect(nearbyScores)}\n----> leaders: ${util.inspect(leaders)}`)
      return Promise.join(buildLeaderboard(leaders), buildNearby(nearbyScores, user, user_index), (leaderboard, nearbyboard) => {
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

const addKarma = (user, amount) => {
  user.karma = _.toInteger(user.karma) + amount
  storage.users.save(user)
  updateScores(user)
  console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma}`)
}

const subtractKarma = (user, amount) => {
  user.karma = _.toInteger(user.karma) - amount
  storage.users.save(user)
  updateScores(user)
  console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma} - updating now...`)
}

const buildLeaderboard = (leaderArray) => {
  const colors = [
    '#D5BF37',
    '#E5E4E2',
    '#CD7F32'
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

const buildNearby = (nearbyArray, user, user_index) => {
  return new Promise((resolve, reject) => {
    let output = { attachments: [] }
    if (!nearbyArray || _.isEmpty(nearbyArray)) resolve(output)
    for (let i = 0; i < nearbyArray.length; i++) {
      if (i === user_index) {
        let text = ''
        for (let j = 0; j < nearbyArray[i].scores.length; j++) {
          if (j === 0) {
            text += `${nearbyArray[i].scores[j].rank_index + 1}: `
          } else {
            text += `     `
          }
          if (nearbyArray[i].scores[j].user_id == user.id) {
            text += `*${nearbyArray[i].scores[j].name}* - *${nearbyArray[i].scores[j].karma}*\n`
          } else {
            text += `${nearbyArray[i].scores[j].name} - ${nearbyArray[i].scores[j].karma}\n`
          }
        }

        output.attachments.push({
          text,
          color: '#05BF37',
          mrkdwn_in: ['text']
        })
      } else {
        let text = `${nearbyArray[i].scores[0].rank_index + 1}: ${nearbyArray[i].scores[0].name} - ${nearbyArray[i].scores[0].karma}\n`
        if (nearbyArray[i].scores.length > 1) {
          text += `     + ${nearbyArray[i].scores.length - 1} more`
        }

        output.attachments.push({
          text,
          color: '#CF53F0',
          mrkdwn_in: ['text']
        })
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
