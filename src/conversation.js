
import util from 'util'
import _ from 'lodash'
import scoreHandler from './scoreboard.js'

const dbScoreboard = scoreHandler.dbScoreboard
const buildScoreboard = scoreHandler.buildScoreboard
const addKarma = scoreHandler.addKarma
const subtractKarma = scoreHandler.subtractKarma
const processUsers = scoreHandler.processUsers
const updateScoreboard = scoreHandler.updateScoreboard

export default (controller, bot) => {
  let fullTeamList
  let fullChannelList
  let localScoreboard

  const getUserEmailArray = (bot) => {
    fullTeamList = []
    fullChannelList = []
    localScoreboard = []

    bot.api.users.list({}, (err, response) => {
      if (err) console.log(err)
      if (response.hasOwnProperty('members') && response.ok) {
        for (let i = 0; i < response.members.length; i++) {
          const member = response.members[i]
          // break this check out into a function
          if (!member.profile.bot_id && !member.deleted && !member.is_bot && (member.real_name !== '' || ' ' || null || undefined)) {
            if (member.real_name.length > 1 && member.name !== 'slackbot') {
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
              localScoreboard.push({ karma: newMember.karma, name: newMember.fullName })
              controller.storage.users.get(newMember.id, (err, user) => {
                if (err) console.log(err)
                if (!user) {
                  console.log('user not found in db')
                  controller.storage.users.save(newMember)
                  console.log(`new member ${newMember.fullName} saved`)
                }
              })
            }
          }
        }
        localScoreboard = _.orderBy(localScoreboard, ['karma', 'name'], ['desc', 'asc'])
        console.log(`localScoreboard:\n${util.inspect(localScoreboard)}`)
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
      console.log(`[conversation] ** retrieving data for team ${message.team}`)
      if (err) console.log(err)
      dbScoreboard(localScoreboard).then((ordered) => {
        console.log(`got dbScoreboard return:\n${util.inspect(ordered)}\n ... about to buildScoreboard`)
        team.scoreboard = ordered
        controller.storage.save(team)
        buildScoreboard(team).then((replyMessage) => {
          const slack = {
            text: `${team.name}: The Scorey So Far...`,
            attachments: replyMessage.attachments
          }
          bot.reply(message, replyMessage)
        })
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
          if (ids[i] !== message.user) {
            addKarma(ids[i])
            console.log(`----> + karma assigned to ${ids[i]}\n${util.inspect(message.user)}`)
            let index = _.findIndex(localScoreboard, (o) => { return o.name == message.user.profile.real_name })
            console.log(`index in local scores: ${index}`)
            localScoreboard[index].karma = localScoreboard[index].karma + 1
            localScoreboard = _.orderBy(localScoreboard, ['karma', 'name'], ['desc', 'asc'])
            console.log(`Local Scoreboard Updated:\n${util.inspect(localScoreboard)}`)
          }
        }
      })
      .then(() => {
        controller.storage.teams.get(message.team, (err, team) => {
          if (err) console.log(err)
          dbScoreboard(localScoreboard, team).then(ordered => {
            localScoreboard = ordered
          })
        })
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
        for (const i in ids) {
          console.log('userId #' + i + ': ' + ids[i])
          if (ids[i] !== message.user) subtractKarma(ids[i])
          console.log(`----> - karma assigned to ${ids[i]}`)
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
      controller.storage.users.get(message.user, (err, user) => {
        if (err) console.log(err)
        bot.replyPrivate(message, {text: `Your karma is: ${user.karma}`})
      })
    }
    if (message.command === '/scoreboard') {
      controller.storage.teams.get(message.team, (err, team) => {
        if (err) console.log(err)
        buildScoreboard(team).then(replyMessage => {
          let slack = {
            text: `${team.name}: The Scorey So Far...`,
            attachments: replyMessage.attachments
          }
          bot.reply(message, slack)
        })
        .catch((err) => {
          bot.replyt(message, { text: err })
        })
      })
    }
  })

  return { getUserEmailArray }
}
