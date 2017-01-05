
import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'

export default (controller, bot) => {
  function updateScoreboard (user) {
    // let scoreboardObj = controller.storage.teams.get('scoreboard')
    let team = controller.storage.teams.get(bot.team_id)
    let scoreboard = team.scoreboard.karma
    let checkScore = _.find(scoreboard, (o) => { return o.name == user.name })
    if (checkScore == -1) scoreboard.push(user)
    else scoreboard[checkScore].score = user.karma
    team.scoreboard = scoreboard
    controller.storage.teams.save(team)
  }

  function addKarma (user) {
    // currently passing in user as a Name -- needs to be the id!!
    bot.api.users.info({user: user}, (err, res) => {
      if (err) console.log(err)
      let slackName = res.user.profile.real_name
      let storedUser = controller.storage.users.get(user)
      if (err) console.log(err)
      if (!storedUser.name || storedUser.name !== slackName) {
        storedUser.name = slackName
      }
      storedUser.karma = _.toInteger(storedUser.karma) + 1
      controller.storage.users.save(storedUser)
      updateScoreboard({name: storedUser.name, score: storedUser.karma})
    })
  }

  function subtractKarma (user) {
    bot.api.users.info({user: user}, (err, res) => {
      if (err) console.log(err)
      let slackName = res.user.profile.real_name
      let storedUser = controller.storage.users.get(user)
      if (err) console.log(err)
      if (!storedUser.name || storedUser.name !== slackName) {
        storedUser.name = slackName
      }
      storedUser.karma = _.toInteger(storedUser.karma) - 1
      controller.storage.users.save(storedUser)
      updateScoreboard({name: storedUser.name, score: storedUser.karma})
    })
  }

  async function scoreboard () {
    try {
      buildResponse().then(scores => {
        return scores
      })
    } catch (err) {
      console.log(err)
    }
  }

  function buildResponse () {
    let team = controller.storage.teams.get(bot.team_id)
    let scoreboard = team.scoreboard.karma
    let output = {text: ''}
    _.forEach(scoreboard, (value) => {
      output.text += `${value.name}: ${value.score}\n`
    })
    return output
  }

  async function processUsers (rawIds) {
    try {
      let ids = await mapIds(rawIds)
      console.log(` ------> done waiting for mapIds ---- ids: ${ids}`)
      mapUserNamesToDB(ids)
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

  function mapUserNamesToDB (ids) {
    console.log('mapping users to mongo: ' + util.inspect(ids))
    _.forEach(ids, (id) => {
      let mongoUser = controller.storage.users.get(_.toString(id))
      console.log('Mongo User:\n' + util.inspect(mongoUser))
      if (!mongoUser) {
        console.log('~ mongoUser undefined ~')
        let newUser = {id: id, team_id: '', name: '', karma: '0'}
        bot.api.users.info({user: id}, (err, res) => {
          if (err) console.log(err)
          newUser.team_id = res.user.team_id
          newUser.name = res.user.profile.real_name
          controller.storage.users.save(newUser)
          console.log(`New User:\n${util.inspect(newUser)} --> saved to db`)
        })
      }
    })
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
  controller.hears('scoreboard', ['direct_message', 'direct_mention'], (bot, message) => {
    scoreboard().then(replyMessage => {
      bot.reply(message, replyMessage)
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
      console.log('reaction was heard!\n', util.inspect(message))
      addKarma(_.toString(message.item_user))
    }

    if (message.reaction === '\-1' && message.user !== message.item_user) {
      console.log('reaction was heard!\n', util.inspect(message))
      subtractKarma(_.toString(message.item_user))
    }
  })
}
