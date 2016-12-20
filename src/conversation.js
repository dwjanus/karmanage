
import util from 'util'
import _ from 'lodash'
import config from './config.js'

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
    bot.say('+1 Heard!')
    let userIds = message.text.match(/<@([A-Z0-9])+>/igm)
    if (userIds.length > 0) {
      console.log('conditional passed, userIds: ', util.inspect(userIds))
      let replyMessage = _.defaults({
        text: 'Karmatime! A point has been awarded to:\n'
      }, msgDefaults)
      for (const userId in userIds) {
        bot.api.users.info({user: userId}, (err, res) => {
          if (err) console.log(err)
          else replyMessage.text += `${res.user.profile.real_name}\n`
        })
      }
      bot.reply(message, replyMessage)
    }
  })

  controller.on('reaction_added', (bot, message) => {
    if (message.reaction === '\+1') {
      console.log('reaction was heard!\n', util.inspect(message))
      let replyMessage = {
        text: `I heard your +1! ${message.item_user} awarded a point!`,
        channel: message.item.channel
      }
      console.log('reply looks like: ', util.inspect(replyMessage))
      bot.reply(message, replyMessage)
    }
  })
}
