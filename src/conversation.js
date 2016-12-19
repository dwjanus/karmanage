
import util from 'util'
import _ from 'lodash'
import slack from 'slack'
import config from './config.js'

export default (controller, bot) => {
  const msgDefaults = {
    as_user: true,
    username: 'Karma Bot',
    color: '#0067B3',
    icon_emoji: config('ICON_EMOJI')
  }

  controller.hears(['(^help$)'], ['direct_message', 'direct_mention'], (bot, message) => {
    let attachments = [
      {
        title: 'Help',
        color: '#0067B3',
        text: 'Simply react to a message with :+1: or' +
              '@mention :+1: someone to give that person a karma point. Direct message/mention ' +
              'Karmabot or use a slash command to view points.',
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
    bot.reply(message, 'Goodbye')
    bot.rtm.close()
  })

  controller.hears('hello', ['direct_message', 'direct_mention'], (bot, message) => {
    bot.reply(message, 'What it do')
  })

  controller.hears(':+1:', ['ambient'], (bot, message) => {
    bot.reply(message, '+1 Heard!')
  })
}
