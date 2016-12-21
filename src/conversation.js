
import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'

export default (controller, bot) => {
  async function populateUserArray (rawIds) {
    try {
      let ids = await mapIds(rawIds)
      console.log(` ------> done waiting for mapIds ---- ids: ${ids}`)
      return await mapUsers(ids)
      // console.log(` ------> done waiting for mapUsers ---- names: ${names}`)
      // return names
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
      cb(null, user)
    })
  }

  var getUserPromise = function (userId) {
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
        text: '/mypoints - for your individual score\n' +
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

  controller.hears([':\\+1:', '\\+\\+'], ['ambient'], (bot, message) => {
    console.log(':+1: was heard ambiently', util.inspect(message))
    let replyMessage = _.defaults({
      text: 'Karmatime! A point has been awarded to: '
    }, msgDefaults)
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      populateUserArray(rawIds).then(userNames => {
        userNames = _.toString(userNames)
        console.log('userNames: ', util.inspect(userNames))
        replyMessage.text += userNames
        bot.reply(message, replyMessage)
      })
    }
  })

  controller.on('reaction_added', (bot, message) => {
    if (message.reaction === '\+1') {
      console.log('reaction was heard!\n', util.inspect(message))
      bot.api.users.info({user: message.item_user}, (err, res) => {
        if (err) console.log(err)
        let name = res.user.profile.real_name
        let replyMessage = {
          text: `I heard your +1! ${name} has been awarded a point!`,
          channel: message.item.channel
        }
        bot.say(replyMessage)
      })
    }
  })
}
