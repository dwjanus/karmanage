import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import mongo from 'botkit-storage-mongo'
import config from './config.js'

const storage = mongo({ mongoUri: config('MONGODB_URI') })

// may try this one for efficiency sake...
//
// const dbScoreboard = (orderedScores) => {
//   return new Promise((resolve, reject) => {
//     let index = 0
//     let scoreboard = [ { scores: [] } ]
//     if (!orderedScores) return reject()
//     for (o of orderedScores) {
//       if (_.isEmpty(scoreboard[index].scores)) {
//         scoreboard[index].scores.push(o)
//       } else {
//         if (scoreboard[index].scores[0].karma === o.karma) {
//           scoreboard[index].scores.push(o)
//         } else {
//           index++
//           scoreboard[index].scores.push(o)
//         }
//       }
//     }
//     Promise.all(scoreboard).then(resolve(scoreboard))
//   })
// }

const dbScoreboard = (orderedScores) => {
  return new Promise((resolve, reject) => {
    if (orderedScores === undefined) return reject()
    let index = 0
    let scoreboard = [ { scores: [] } ]
    return Promise.map(orderedScores, (o) => {
      if (_.isEmpty(scoreboard[index].scores)) {
        scoreboard[index].scores.push(o)
      } else {
        if (scoreboard[index].scores[0].karma === o.karma) {
          scoreboard[index].scores.push(o)
        } else {
          index++
          scoreboard[index] = { scores: [] }
          scoreboard[index].scores.push(o)
        }
      }
      return scoreboard
    })
    .then(() => {
      return resolve(scoreboard)
    })
    .catch((err) => {
      console.log(err)
    })
    return resolve(scoreboard)
  })
}


const buildScoreboard = (team) => {
  return new Promise((resolve, reject) => {
    console.log(`\n... building scoreboard for team ${team.id}...`)
    const leaders = _.slice(team.scoreboard, 0, 5)
    const losers = _.slice(team.scoreboard, 5, team.scoreboard.length)
    console.log(`[buildScoreboard] ** got our leaders and losers **\nLeaders:\n${util.inspect(leaders)}\nLosers:\n${util.inspect(losers)}`)
    return Promise.join(buildLeaderboard(leaders), buildLoserboard(losers), (leaderboard, loserboard) => {
      if (loserboard.attachments) leaderboard.attachments = leaderboard.attachments.concat(loserboard.attachments)
      console.log(`[buildScoreboard] leaderboard before resolve:\n${util.inspect(leaderboard)}`)
      return resolve(leaderboard)
    })
    .catch((err) => {
      if (err) reject(err)
    })
  })
}

const addKarma = (user) => {
  user.karma = _.toInteger(user.karma) + 1
  storage.users.save(user)
  console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma}`)
}

const subtractKarma = (user) => {
  user.karma = _.toInteger(user.karma) - 1
  storage.users.save(user)
  console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma} - updating now...`)
}

const buildLeaderboard = (leaderArray) => {
  const colors = [
    '#E5E4E2',
    '#D4AF37',
    '#C0C0C0',
    '#CD7F32',
    '#CF5300'
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
    console.log(`building loserboard:\n${util.inspect(loserArray)}`)
    let output = { attachments: [] }
    if (!loserArray || _.isEmpty(loserArray)) resolve(output)
    for (let i = 5; i < loserArray.length; i++) { // i was initially = 6 (?)
      output.attachments.push({ text: `${i + 1}: `, color: '#0067B3' })
      for (let s of loserArray[i].scores) {
        if (s === loserArray[i].scores) output.attachments[i].text += `${s.name} - ${s.karma}\n`
        else output.attachments[i].text += `     ${s.name} - ${s.karma}\n`
      }
    }
    Promise.all(output.attachmnets).then(resolve(output)).catch((err) => reject(err))
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
  addKarma,
  subtractKarma,
  processUsers,
  updateScoreboard
}
