
import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'

export default (controller, bot) => {
  function updateScoreboard (user) {
    controller.storage.teams.get(user.team_id, (err, team) => {
      if (err) console.log(err)
      let teamKarma = team.scoreboard.karma
      console.log('Updating Scoreboard - teamKarma:\n' + util.inspect(teamKarma))
      let checkScore = _.findIndex(teamKarma, (o) => { return o.name == user.name })
      console.log('checkScore: ' + checkScore)
      if (checkScore == -1) {
        teamKarma.push({name: user.name, score: user.karma})
      } else {
        teamKarma[checkScore].score = user.karma
      }
      team.scoreboard.karma = teamKarma
      controller.storage.teams.save(team)
    })
  }

  function addKarma (user) {
    controller.storage.users.get(user, (err, res) => {
      if (err) console.log(err)
      console.log('Stored User: ' + util.inspect(res))
      if (res === undefined) {
        console.log('~ User undefined ~')
        mapUserToDB(user, (newUser) => {
          newUser.karma = _.toInteger(newUser.karma) + 1
          controller.storage.users.save(newUser)
          updateScoreboard(newUser)
        })
      } else {
        res.karma = _.toInteger(res.karma) + 1
        controller.storage.users.save(res)
        updateScoreboard(res)
      }
    })
  }

  function subtractKarma (user) {
    controller.storage.users.get(user, (err, res) => {
      if (err) console.log(err)
      console.log('Stored User: ' + util.inspect(res))
      if (res === undefined) {
        console.log('~ User undefined ~')
        mapUserToDB(user, (newUser) => {
          newUser.karma = _.toInteger(newUser.karma) - 1
          controller.storage.users.save(newUser)
          updateScoreboard(newUser)
        })
      } else {
        res.karma = _.toInteger(res.karma) - 1
        controller.storage.users.save(res)
        updateScoreboard(res)
      }
    })
  }

  async function scoreboard (teamKarma) {
    try {
      let scoreboard = await buildResponse(teamKarma)
      return scoreboard
    } catch (err) {
      console.log(err)
    }
  }

  function buildResponse (teamKarma) {
    return new Promise((resolve, reject) => {
      if (!teamKarma) reject(teamKarma)
      let output = {text: ''}
      _.forEach(teamKarma, (value) => {
        output.text += `${value.name}: ${value.score}\n`
      })
      resolve(output)
    })
  }

  async function processUsers (rawIds) {
    try {
      let ids = await mapIds(rawIds)
      console.log(` ------> done waiting for mapIds ---- ids: ${ids}`)
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

  function mapUserToDB (id, cb) {
    console.log(`mapping user: ${id} to mongo`)
    let newUser = {id: id, team_id: '', name: '', karma: '0'}
    bot.api.users.info({user: id}, (err, res) => {
      if (err) console.log(err)
      newUser.team_id = res.user.team_id
      newUser.name = res.user.profile.real_name
      controller.storage.users.save(newUser)
      console.log(`New User:\n${util.inspect(newUser)}\n--> saved to db`)
      cb(newUser)
    })
  }

  controller.hears(['(^help$)'], ['direct_message', 'direct_mention'], (bot, message) => {
    let attachments = [
      {
        title: 'Help',
        color: '#0067B3',
        text: 'Simply react to a message with :+1: or ' +
              '@mention someone :+1: to give that person a karma point. ' +
              'Direct message/mention Karmabot or use a slash command to ' +
              'view points.',
        fields: [
          {
            title: 'Example', // maybe make this a gif or jpg?
            value: 'Jamie: @samanage: how much karma do I have?\n' +
                   'Karmabot: You have 15 karma!\n',
            short: false
          }
        ]
      },
      {
        title: 'Slash Command Reference',
        color: '#009999',
        text: '/mykarma - for your individual score\n' +
              '/scoreboard - to view karma ranking for entire team\n',
        footer: 'Karmabot - v. 1.0',
        mrkdown_in: ['text', 'pretext']
      }
    ]

    let replyWithAttachments = {
      pretext: 'Karmabot help',
      text: 'Karmabot keeps track of your karma!',
      attachments,
      mrkdown_in: ['text', 'pretext']
    }

    bot.reply(message, replyWithAttachments)
  })

  controller.hears('^stop', 'direct_message', (bot, message) => {
    bot.reply(message, {text: 'Goodbye'})
    bot.rtm.close()
  })

  controller.hears('hello', ['direct_message', 'direct_mention'], (bot, message) => {
    bot.reply(message, {text: 'What it do'})
  })

  // temporary command to test what users we have
  controller.hears(['my karma', 'my score'], ['direct_message', 'direct_mention'], (bot, message) => {
    controller.storage.users.get(message.user, (err, user) => {
      if (err) console.log(err)
      bot.reply(message, {text: `Your karma is: ${user.karma}`})
    })
  })

  // temporary command to test what users we have
  // Eventually we want the scoreboard to be an array of value maps so it auto updates
  controller.hears('scoreboard', ['direct_message', 'direct_mention'], (bot, message) => {
    console.log(util.inspect(message))
    controller.storage.teams.get(message.team, (err, team) => {
      if (err) console.log(err)
      console.log('Scoreboard:\n' + util.inspect(team.scoreboard))
      scoreboard(team.scoreboard.karma).then(replyMessage => {
        let slack = {
          text: `${team.name}: The Scorey So Far...`,
          attachments: [
            {
              text: replyMessage.text,
              color: '#0067B3'
            }
          ]
        }
        bot.reply(message, slack)
      })
    })
  })

  // Handles adding karma via @mention
  controller.hears([':\\+1:', '\\+\\+', '\\+1'], ['ambient'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      processUsers(rawIds).then(ids => {
        console.log('user ids: ', util.inspect(ids))
        for (const i in ids) {
          console.log('userId #' + i + ': ' + ids[i])
          addKarma(ids[i])
          console.log(` ----> + karma assigned to ${ids[i]}`)
        }
      })
    }
  })

  // Handles subtracting karma via @mention
  controller.hears([':\\-1:', '\\-\\-', '\\-1'], ['ambient'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      processUsers(rawIds).then(ids => {
        console.log('user ids: ', util.inspect(ids))
        for (const i in ids) {
          console.log('userId #' + i + ': ' + ids[i])
          subtractKarma(ids[i])
          console.log(` ----> - karma assigned to ${ids[i]}`)
        }
      })
    }
  })

  controller.on('reaction_added', (bot, message) => {
    if (message.reaction === '\+1') { // && message.user !== message.item_user) {
      addKarma(message.item_user)
    }

    if (message.reaction === '\-1' && message.user !== message.item_user) {
      subtractKarma(message.item_user)
    }
  })
}
