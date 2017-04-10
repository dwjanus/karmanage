
import util from 'util'
import _ from 'lodash'
import scoreHandler from './scoreboard.js'

const scoreboard = scoreHandler.scoreboard
const addKarma = scoreHandler.addKarma
const subtractKarma = scoreHandler.subtractKarma
const processUsers = scoreHandler.processUsers
const buildScoreboard = scoreHandler.buildScoreboard

export default (controller, bot) => {
  let fullTeamList
  let fullChannelList

  const getUserEmailArray = (bot) => {
    fullTeamList = []
    fullChannelList = []
    bot.api.users.list({}, (err, response) => {
      if (err) console.log(err)
      if (response.hasOwnProperty('members') && response.ok) {
        for (let i = 0; i < response.members.length; i++) {
          const member = response.members[i]
          console.log(`Member ${i}:\n${util.inspect(member)}`)
          let newMember = {
            id: member.id,
            team_id: member.team_id,
            name: member.name,
            fullName: member.real_name,
            email: member.profile.email
          }
          if (member.karma) newMember.karma = member.karma
          else newMember.karma = 0
          fullTeamList.push(newMember)
          // break this check out into a function
          if (!member.deleted && !member.is_bot && member.real_name !== '' || ' ' || null || undefined) {
            if (member.real_name.length > 1 && member.name !== 'slackbot') {
              // -->
              console.log(`check passed for member:\n ${util.inspect(newMember)}`)
              controller.storage.users.get(member.id, (err, user) => {
                if (err) reject(err)
                if (!user) {
                  console.log('user not found in db')
                  controller.storage.users.save(newMember)
                  console.log(`new member ${newMember.fullName} saved`)
                }
                updateScoreboard(newMember)
              })
            }
          }
        }
      }
    })

    bot.api.channels.list({}, (err, response) => {
      if (err) console.log(err)
      if (response.hasOwnProperty('channels') && response.ok) {
        const total = response.channels.length
        for (let i = 0; i < total; i++) {
          const channel = response.channels[i]
          fullChannelList.push({ id: channel.id, name: channel.name })
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
    controller.storage.users.get(message.user, (err, user) => {
      if (err) console.log(err)
      bot.reply(message, {text: `Your karma is: ${user.karma}`})
    })
  })

  controller.hears(['scoreboard', 'scores'], ['direct_message', 'direct_mention'], (bot, message) => {
    console.log('[conversation] ** scoreboard heard **')
    controller.storage.teams.get(message.team, (err, team) => {
      console.log(`[conversation] ** retrieving data for team ${message.team} **\n${util.inspect(team)}\n`)
      if (err) console.log(err)
      buildScoreboard(team).then(replyMessage => {
        bot.reply(message, { text: `${team.name}: The Scorey So Far...`, attachments: replyMessage.attachments })
      })
      .catch((err) => {
        bot.reply(message, { text: err })
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
          if (ids[i] !== message.user) addKarma(ids[i])
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
          if (ids[i] !== message.user) subtractKarma(ids[i])
          console.log(` ----> - karma assigned to ${ids[i]}`)
        }
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
      controller.storage.users.get(message.user_id, (err, user) => {
        if (err) console.log(err)
        bot.replyPrivate(message, {text: `Your karma is: ${user.karma}`})
      })
    }
    if (message.command === '/scoreboard') {
      controller.storage.teams.get(message.team_id, (err, team) => {
        if (err) console.log(err)
        let leaders = _.slice(team.scoreboard.karma, 0, 4)
        let teamKarma = _.slice(team.scoreboard.karma, 5, team.scoreboard.karma.length)
        scoreboard(leaders, teamKarma).then(replyMessage => {
          let slack = {
            text: `${team.name}: The Scorey So Far...`,
            attachments: replyMessage.attachments
          }
          bot.reply(message, slack)
        })
      })
    }
  })

  return { getUserEmailArray }
}
