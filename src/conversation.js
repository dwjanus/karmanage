
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
          updateScoreboard({name: newUser.name, score: newUser.karma})
        })
      } else {
        res.karma = _.toInteger(res.karma) - 1
        controller.storage.users.save(res)
        updateScoreboard({name: res.name, score: res.karma})
      }
    })
  }

  async function scoreboard (teamKarma) {
    try {
      buildResponse(teamKarma).then(scoreboard => {
        return scoreboard
      })
    } catch (err) {
      console.log(err)
    }
  }

  function buildResponse (teamKarma) {
    let output = {text: ''}
    _.forEach(teamKarma, (value) => {
      output.text += `${value.name}: ${value.score}\n`
    })
    return output
  }

  async function processUsers (rawIds) {
    try {
      let ids = await mapIds(rawIds)
      console.log(` ------> done waiting for mapIds ---- ids: ${ids}`)
      for (const i in ids) {
        mapUserToDB(ids[i])
      }
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
    console.log('mapping user to mongo: ' + util.inspect(id))
    if (controller.storage.users.get(id) === undefined) {
      console.log('~ mongoUser undefined ~')
      let newUser = {id: id, team_id: '', name: '', karma: '0'}
      bot.api.users.info({user: id}, (err, res) => {
        if (err) console.log(err)
        newUser.team_id = res.user.team_id
        newUser.name = res.user.profile.real_name
        controller.storage.users.save(newUser)
        console.log(`New User:\n${util.inspect(newUser)}\n--> saved to db`)
        cb(newUser)
      })
    } else {
      console.log('User exists!')
    }
  }

  const msgDefaults = {
    response_type: 'in_channel',
    username: 'Karma Bot',
    color: '#0067B3'
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

    let replyWithAttachments = _.defaults({
      pretext: 'Karmabot help',
      text: 'Karmabot keeps track of your karma!',
      attachments,
      mrkdown_in: ['text', 'pretext']
    }, msgDefaults)

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
  controller.hears('my karma', ['direct_message'], (bot, message) => {
    let user = controller.storage.users.get(_.toString(message.user))
    bot.reply(message, {text: `Your karma is: ${user.karma}`})
  })

  // temporary command to test what users we have
  // Eventually we want the scoreboard to be an array of value maps so it auto updates
  controller.hears('scoreboard', ['direct_message', 'direct_mention'], (bot, message) => {
    console.log(util.inspect(message))
    controller.storage.teams.get(message.team, (err, team) => {
      if (err) console.log(err)
      console.log('Scoreboard:\n' + util.inspect(team.scoreboard))
      scoreboard(team.scoreboard.karma).then(replyMessage => {
        bot.reply(message, replyMessage)
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
          console.log(` ----> karma assigned to ${ids[i]}`)
        }
      })
    }
  })

  // Handles subtracting karma via @mention
  controller.hears([':\\-1:', '\\-\\-', '\\-1'], ['ambient'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      processUsers(rawIds).then(userNames => {
        userNames = _.toString(userNames)
        console.log('userNames: ', util.inspect(userNames))
        for (const user in userNames) {
          subtractKarma(user)
          console.log(` ----> karma assigned to ${user}`)
        }
      })
    }
  })

  controller.hears('me', ['direct_message'], (bot, message) => {
    let mongo = controller.storage.users.get(message.user)
    console.log('Mongo: ' + util.inspect(mongo))
    bot.api.users.info({user: message.user}, (err, res) => {
      if (err) console.log(err)
      console.log('Slack: ' + util.inspect(res))
    })
  })

  controller.on('reaction_added', (bot, message) => {
    if (message.reaction === '\+1') { // && message.user !== message.item_user) {
      addKarma(message.item_user)
    }

    if (message.reaction === '\-1' && message.user !== message.item_user) {
      console.log('reaction was heard!\n', util.inspect(message))
      subtractKarma(_.toString(message.item_user))
    }
  })
}
