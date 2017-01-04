
import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'

export default (controller, bot) => {
  function addKarma (user) {
    controller.storage.users.get(user, (err, user) => {
      if (err) console.log(err)
      user.karma = _.toInteger(user.karma) + 1
      controller.storage.users.save(user)
    })
  }

  function subtractKarma (user) {
    controller.storage.users.get(user, (err, user) => {
      if (err) console.log(err)
      user.karma = _.toInteger(user.karma) - 1
      controller.storage.users.save(user)
    })
  }

  function scoreboardPromise () {
    return new Promise((resolve, reject) => {
      controller.storage.users.all((err, users) => {
        if (err) reject(err)
        let replyMessage = {text: ''}
        for (const u in users) {
          if (_.toInteger(users[u].karma) > 0) {
            let karma = users[u].karma
            bot.api.users.info(users[u].id, (err, res) => {
              if (err) console.log(err)
              replyMessage.text += `${res.user.profile.real_name}: ${karma}\n`
            })
          }
        }
        resolve(replyMessage)
      })
    })
  }

  async function scoreboard () {
    try {
      let scores = await scoreboardPromise()
      console.log(` ------> done waiting for scores \n${scores}`)
      return scores
    } catch (err) {
      console.log(err)
    }
  }

  async function populateUserArray (rawIds) {
    try {
      let ids = await mapIds(rawIds)
      console.log(` ------> done waiting for mapIds ---- ids: ${ids}`)
      let names = await mapUsers(ids)
      console.log(` ------> done waiting for mapUsers ---- names: ${names}`)
      return names
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

  function mapUsers (userIds) {
    console.log(` --> mapUsers ---- userIds: ${userIds}`)
    return new Promise((resolve, reject) => {
      let names = Promise.map(userIds, getUserPromise)
      resolve(names)
    })
  }

  function getUserName (userId, cb) {
    console.log(` ---> getUserName ---- userId: ${userId}`)
    bot.api.users.info({user: userId}, (err, res) => {
      if (err) console.log(err)
      let user = res.user.profile.real_name
      console.log(` ----> user found: ${user}`)
      return cb(user)
    })
  }

  function getUserPromise (userId) {
    return new Promise((resolve, reject) => {
      getUserName(userId, resolve)
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
    controller.storage.users.get(_.toString(message.user), (err, user) => {
      if (err) console.log(err)
      bot.reply(message, {text: `Your karma is: ${user.karma}`})
    })
  })

  // temporary command to test what users we have
  controller.hears('scoreboard', ['direct_message', 'direct_mention'], (bot, message) => {
    let replyMessage = scoreboard()
    bot.reply(message, replyMessage)
  })

  // Handles adding karma via @mention
  controller.hears([':\\+1:', '\\+\\+', '\\+1'], ['ambient'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      populateUserArray(rawIds).then(userNames => {
        userNames = _.toString(userNames)
        console.log('userNames: ', util.inspect(userNames))
        for (const user in userNames) {
          addKarma(user)
          console.log(` ----> karma assigned to ${user}`)
        }
      })
    }
  })

  // Handles subtracting karma via @mention
  controller.hears([':\\-1:', '\\-\\-', '\\-1'], ['ambient'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      populateUserArray(rawIds).then(userNames => {
        userNames = _.toString(userNames)
        console.log('userNames: ', util.inspect(userNames))
        for (const user in userNames) {
          subtractKarma(user)
          console.log(` ----> karma assigned to ${user}`)
        }
      })
    }
  })

  controller.on('reaction_added', (bot, message) => {
    if (message.reaction === '\+1' && message.user !== message.item_user) {
      console.log('reaction was heard!\n', util.inspect(message))
      addKarma(_.toString(message.item_user))
      // use this for logging later
      // bot.api.users.info({user: message.item_user}, (err, res) => {
      //   if (err) console.log(err)
      //   let name = res.user.profile.real_name
      //   let replyMessage = {
      //     text: `I heard your +1! ${name} has been awarded a point!`,
      //     channel: message.item.channel
      //   }
      //   bot.say(replyMessage)
      // })
    }

    if (message.reaction === '\-1' && message.user !== message.item_user) {
      console.log('reaction was heard!\n', util.inspect(message))
      subtractKarma(_.toString(message.item_user))
      // Use this for logging later
      // bot.api.users.info({user: message.item_user}, (err, res) => {
      //   if (err) console.log(err)
      //   let name = res.user.profile.real_name
      //   let replyMessage = {
      //     text: `I heard your +1! ${name} has been awarded a point!`,
      //     channel: message.item.channel
      //   }
      //   bot.say(replyMessage)
      // })
    }
  })
}
