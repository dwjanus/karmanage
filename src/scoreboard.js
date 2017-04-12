import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'
import mongo from 'botkit-storage-mongo'
import config from './config.js'

const storage = mongo({ mongoUri: config('MONGODB_URI') })

// NOTE:
// May need to restructure database schema to handle ties
// --> scoreboard: [
//      { scores: [
//          { name, karma }
//          { name, karma }
//        ]
//      },
//      { scores: [] }
//      { scores: [] }  ]  --> etc.
//
// Would also decrease complexity of some build functions

const dbScoreboard = (orderedScores) => {
  return new Promise((resolve, reject) => {
    let index = 0
    let scoreboard = [ { scores: [] } ]
    if (!orderedScores) return reject()
    return Promise.map(orderedScores, (o) => {
      if (_.isEmpty(scoreboard[index].scores)) {
        scoreboard[index].scores.push(o)
      } else {
        if (scoreboard[index].scores[0].karma === o.karma) {
          scoreboard[index].scores.push(o)
        } else {
          index++
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

const buildScoreboard = (team) => {
  return new Promise((resolve, reject) => {
    console.log(`\n... building scoreboard for team ${team.id}...`)
    let leaders = []
    let losers = []
    if (team.scoreboard.length > 5) {
      leaders = _.slice(team.scoreboard, 0, 5)
      losers = _.slice(team.scoreboard, 5, team.scoreboard.length)
    } else {
      leaders = _.slice(team.scoreboard, 0, team.scoreboard.length)
    }
    console.log(`[buildScoreboard] ** got our leaders and losers **\nLeaders:\n${util.inspect(leaders)}\nLosers:\n${util.inspect(losers)}`)
    return Promise.join(buildLeaderboard(leaders), buildLoserboard(losers), (leaderboard, loserboard) => {
      if (loserboard) leaderboard.attachments = leaderboard.attachments.concat(loserboard)
      console.log(`[buildScoreboard] leaderboard before resolve:\n${util.inspect(leaderboard)}`)
      return resolve(leaderboard)
    })
    .catch((err) => {
      if (err) reject(err)
    })
  })
}

const updateScoreboard = (user) => {
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
  })
}

const addKarma = (userId) => {
  storage.users.get(userId, (err, user) => {
    if (err) console.log(err)
    console.log('Stored User:\n' + util.inspect(user))
    user.karma = _.toInteger(user.karma) + 1
    storage.users.save(user)
    console.log(`[scoreboard] user ${user.id} saved with new karma of ${user.karma} - updating now...`)
    // updateScoreboard(user)
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

const buildLeaderboard = (leaderArray) => {
  console.log(`--> building leaderboard with:\n${util.inspect(leaderArray)}`)
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
      for (s of leaderArray[i].scores) {
        output.attachments.push({text: `${i + 1}: ${s.name} - ${s.karma}`, color: colors[i]})
        i++
      }
    }
    Promise.all(output.attachments).then(resolve(output))
  })
}

const buildLoserboard = (loserArray) => {
  console.log('--> building loserboard')
  return new Promise((resolve, reject) => {
    if (!loserArray) reject(new Error('invalid loser array'))
    let output = { text: '', color: '#0067B3' }
    for (let i = 5; i < loserArray.length; i++) { // i was initially = 6 (?)
      _.forEach(loserArray[i].scores, (value) => {
        output.text += `${i}: ${value.name}: ${value.karma}\n`
        i++
      })
    }
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
  dbScoreboard,
  buildScoreboard,
  addKarma,
  subtractKarma,
  processUsers,
  updateScoreboard
}
