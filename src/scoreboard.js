import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import mongo from './db.js'
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

const dbScoreboard = (teamId) => {
  return new Promise((resolve, reject) => {
    if (teamId === undefined) return reject()
    let index = 0
    let scoreboard = [ { scores: [] } ]
    storage.scores.get(teamId, (err, scores) => {
      if (err) return reject(err)
      return Promise.map(scores.ordered, (o) => {
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
        o.rank_index = index
        storage.scores.save(o)
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
      return resolve(leaderboard)
    })
    .catch((err) => {
      if (err) reject(err)
    })
  })
}

const buildLimitedScoreboard = (team, user) => {
  return new Promise((resolve, reject) => {
    console.log(`\n... building limited scoreboard for user ${user.id} in team ${team.id}...`)
    storage.scores.get(team.id, (err, scores) => {
      if (err) return reject(err)
      const found = _.findIndex(scores.ordered, (o) => { return o.user_id == user.id })
      const start = found >= 2 ? found - 2 : 0
      const nearbyScores = _.slice(scores.ordered, start, found + 3)
      return buildNearby(nearbyScores).then((nearbyboard) => {
        console.log(`got our nearbyboard:\n${util.inspect(nearbyboard)}`)
        return resolve(nearbyboard)
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
    '#CD7F32',
    '#CF5300',
    '#952A2A'
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
    Promise.all(output.attachments).then(resolve(output)).catch((err) => reject(err))
  })
}

const buildNearby = (nearbyArray) => {
  const colors = [
    '#05BF37',
    '#F5E4E2',
    '#FF7F32',
    '#CF53F0',
    '#650A0C'
  ]
  return new Promise((resolve, reject) => {
    console.log(`building nearbyboard:\n${util.inspect(nearbyArray)}`)
    let output = { attachments: [] }
    if (!nearbyArray || _.isEmpty(nearbyArray)) resolve(output)
    let c = 0
    output.attachments.push({ text: `${nearbyArray[0].rank_index + 1}: ${nearbyArray[0].name} - ${nearbyArray[0].karma}\n`, color: colors[c] })
    for (let i = 1; i < nearbyArray.length; i++) {
      if (nearbyArray[i].karma < nearbyArray[i - 1].karma) {
        c += 1
        output.attachments.push({ text: `${nearbyArray[i].rank_index + 1}: ${nearbyArray[i].name} - ${nearbyArray[i].karma}\n`, color: colors[c] })
      } else output.attachments[c].text += `     ${nearbyArray[i].name} - ${nearbyArray[i].karma}\n`
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
