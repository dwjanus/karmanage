
import util from 'util'
import _ from 'lodash'
import scoreHandler from './scoreboard.js'
import Promise from 'bluebird'

const dbScoreboard = scoreHandler.dbScoreboard
const buildScoreboard = scoreHandler.buildScoreboard
const buildLimitedScoreboard = scoreHandler.buildLimitedScoreboard
const addKarma = scoreHandler.addKarma
const subtractKarma = scoreHandler.subtractKarma
const processUsers = scoreHandler.processUsers

export default (controller, bot) => {
  const buildUserArray = (bot) => {
    bot.api.users.list({}, (err, response) => {
      if (err) console.log(err)
      if (response.hasOwnProperty('members') && response.ok) {
        for (let i = 0; i < response.members.length; i++) {
          if (!member.profile.bot_id && !member.deleted &&
          !member.is_bot && (member.real_name != '' || ' ' || null || undefined)
          && (member.name != '' || ' ' || null || undefined)) {
            if (member.real_name.length > 1 && member.name !== 'slackbot') {
              const newMember = {
                id: member.id,
                team_id: member.team_id,
                name: member.name,
                fullName: member.real_name,
                email: member.profile.email,
                karma: 0,
                is_admin: member.is_admin
              }
              controller.storage.users.get(member.id, (err, user) => {
                if (err) console.log(err)
                if (!user) {
                  console.log('user not found in db')
                  console.log(`new member ${newMember.fullName} saved`)
                }
                else newMember.karma = user.karma
                controller.storage.users.save(newMember)
              })
            }
          }
        }
      }
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
            value: 'Jamie: @karmabot: how much karma do I have?\n' +
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

  controller.hears(['my karma', 'my score'], ['direct_message', 'direct_mention'], (bot, message) => {
    if (message.event !== 'direct_message') bot.reply = bot.replyPrivate
    controller.storage.users.get(message.user, (err, user) => {
      if (err) console.log(err)
      bot.reply(message, {text: `Your karma is: ${user.karma}`})
    })
  })

  controller.hears(['scoreboard', 'scores'], ['direct_message', 'direct_mention'], (bot, message) => {
    console.log('[conversation] ** scoreboard heard **')
    if (message.event !== 'direct_message') bot.reply = bot.replyInThread
    controller.storage.teams.get(message.team, (err, team) => {
      if (err) console.log(err)
      dbScoreboard(team.id).then((ordered) => {
        team.scoreboard = ordered
        controller.storage.teams.save(team)
        controller.storage.users.get(message.user, (err, user) => {
          if (err) console.log(err)
          if (user.is_admin) { // || user.id == U1EG4KCS1
            console.log('user is admin - building full scoreboard')
            buildScoreboard(team).then((replyMessage) => {
              const slack = {
                text: `${team.name}: The Scorey So Far...`,
                attachments: replyMessage.attachments
              }
              bot.reply(message, replyMessage)
            })
            .catch((err) => {
              bot.replyInThread(message, { text: err })
            })
          } else {
            console.log('user is not admin - building limited scoreboard')
            buildLimitedScoreboard(team, user).then((replyMessage) => {
              const slack = {
                text: `${team.name}: The Scorey So Far...`,
                attachments: replyMessage.attachments
              }
              bot.reply(message, replyMessage)
            })
            .catch((err) => {
              bot.replyInThread(message, { text: err })
            })
          }
        })
      })
    })
  })

  // Handles adding karma via @mention
  controller.hears([':\\+1:', '\\+\\+', '\\+1'], ['ambient'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      processUsers(rawIds).then(ids => {
        console.log('user ids: ', util.inspect(ids))
        for (let i in ids) {
          console.log('userId #' + i + ': ' + ids[i])
          if (ids[i] !== message.user) {
            controller.storage.users.get(ids[i], (err, user) => {
              if (err) console.log(err)
              addKarma(user)
              console.log(`----> + karma assigned to ${ids[i]}`)
            })
          }
        }
      })
      .catch((err) => {
        console.log(err)
      })
    }
  })

  // Handles subtracting karma via @mention
  controller.hears([':\\-1:', '\\-\\-', '\\-1'], ['ambient'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      processUsers(rawIds).then(ids => {
        console.log('user ids: ', util.inspect(ids))
        for (let i in ids) {
          console.log('userId #' + i + ': ' + ids[i])
          if (ids[i] !== message.user) {
            controller.storage.users.get(ids[i], (err, user) => {
              if (err) console.log(err)
              subtractKarma(user)
              console.log(`----> - karma assigned to ${ids[i]}`)
            })
          }
        }
      })
      .catch((err) => {
        console.log(err)
      })
    }
  })

  /*************************************************************************************************/

  controller.on('reaction_added', (bot, message) => {
    if (message.reaction === '\+1' && message.user !== message.item_user) {
      addKarma(message.item_user)
    }
    if (message.reaction === '\-1' && message.user !== message.item_user) {
      subtractKarma(message.item_user)
    }
  })

  controller.on('slash_command', (bot, message) => {
    console.log('Slash command heard!\n' + util.inspect(message))
    if (message.command === '/mykarma') {
      controller.storage.users.get(message.user, (err, user) => {
        if (err) console.log(err)
        bot.replyPrivate(message, {text: `Your karma is: ${user.karma}`})
      })
    }
    if (message.command === '/scoreboard') {
      controller.storage.teams.get(message.team, (err, team) => {
        if (err) console.log(err)
        dbScoreboard(team.id).then((ordered) => {
          team.scoreboard = ordered
          controller.storage.teams.save(team)
          buildScoreboard(team).then((replyMessage) => {
            const slack = {
              text: `${team.name}: The Scorey So Far...`,
              attachments: replyMessage.attachments
            }
            bot.replyPrivate(message, replyMessage)
          })
        })
        .catch((err) => {
          bot.replyPrivate(message, { text: err })
        })
      })
    }
  })

  return { buildUserArray }
}
