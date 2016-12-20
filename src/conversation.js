
import util from 'util'
import _ from 'lodash'
import Promise from 'bluebird'

async function populateUserArray (bot, rawIds) {
  try {
    let ids = await mapIds(rawIds)
    let names = await mapUsers(bot, ids)
    return names
  } catch (err) {
    console.log(err)
  }
}

function processRawId (rawId) {
  return new Promise.resolve(_.toString(rawId).substring(2, 11))
}

function mapIds (rawIds) {
  return new Promise.map(rawIds, processRawId(rawIds))
}

function getUserName (bot, userId) {
  return new Promise((resolve, reject) => {
    bot.api.users.info({user: userId}, (err, res) => {
      if (err) reject(err)
      resolve(res.user.profile.real_name)
    })
  })
}

function mapUsers (bot, userIds) {
  return new Promise.map(userIds, getUserName(bot, userIds))
}

export default (controller, bot) => {
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
    // 1. get Ids mentioned
    // 2. remove unnecessary chars
    // 3. look up each id and save the returned name to an array
    if (rawIds.length > 0) {
      console.log('first conditional passed: ', util.inspect(rawIds))
      let userNames = populateUserArray(bot, rawIds)
      console.log('userNames: ', util.inspect(userNames))
      replyMessage.text += _.toString(userNames)
      bot.reply(message, replyMessage)
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
