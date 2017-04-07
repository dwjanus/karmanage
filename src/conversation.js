
import util from 'util'
import _ from 'lodash'
import scoreHandler from './scoreboard.js'

const scoreboard = scoreHandler.scoreboard
const addKarma = scoreHandler.addKarma
const subtractKarma = scoreHandler.subtractKarma
const processUsers = scoreHandler.processUsers

export default (controller, bot) => {
  let fullTeamList = []
  let fullChannelList = []

  const getUserEmailArray = (bot) => {
    return new Promise((resolve, reject) => {
      bot.api.users.list({}, (err, response) => {
        if (err) console.log(err)
        if (response.hasOwnProperty('members') && response.ok) {
          const total = response.members.length
          for (let i = 0; i < total; i++) {
            const member = response.members[i]
            let newMember = {
              id: member.id,
              team_id: member.team_id,
              name: member.name,
              fullName: member.real_name,
              email: member.profile.email,
              karma: 0
            }
            if (!member.deleted && !member.is_bot && (member.real_name !== "" || " " || null || undefined)) {
              if (member.real_name.length > 1 && member.name !== 'slackbot') {
                controller.storage.users.get(member.id, (err, user) => {
                  if (err) reject(err)
                  if (!user) {
                    fullTeamList.push(newMember)
                    controller.storage.users.save(newMember)
                    console.log(`new member ${newMember.fullName} saved`)
                    // scoreHandler.updateScoreboard(newMember)
                  } else {
                    newMember.karma = user.karma
                    fullTeamList.push(newMember)
                    // scoreHandler.updateScoreboard(user)
                  }
                })
              }
            }
          }
        }
        resolve()
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
    })
  }

  const updateScoreboard = () => {
    console.log('updating scoreboard...')
    controller.storage.teams.get(fullTeamList[0].team_id, (err, team) => {
      if (err) console.log(err)
      console.log(`team: ${team.name} found - scoreboard:\n${util.inspect(team.scoreboard)}`)
      let board = []
      for (let i = 0; i < fullTeamList.length; i++) {
        let score = { karma: fullTeamList[i].karma, name: fullTeamList[i].fullName }
        console.log(`newScore:\n${util.inspect(newScore)}`)
        if (newScore.name !== "" || " " || null || undefined) {
          // if (!(_.find(board, (o) => { return o.name == newScore.name }))) {
            board.push(newScore)
          // }
        }
      }
      team.scoreboard = _.orderBy(board, ['karma', 'name'], ['desc', 'asc'])
      console.log(`new karma:\n${util.inspect(team.scoreboard)}`)
      controller.storage.teams.save(team)
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
      console.log(`[conversation] ** retrieving team data **`)
      if (err) console.log(err)
      let leaders = _.slice(team.scoreboard, 0, 5)
      let losers = _.slice(team.scoreboard, 5, team.scoreboard.length)
      console.log(`[conversation] ** got our leaders and losers **\nLeaders:\n${util.inspect(leaders)}\nLosers:\n${util.inspect(losers)}`)
      const teamKarma = team.scoreboard
      team.scoreboard = _.orderBy(teamKarma, ['karma', 'name'], ['desc', 'asc'])
      controller.storage.teams.save(team)
      scoreboard(leaders, losers).then(replyMessage => {
        let slack = {
          as_user: true,
          text: `${team.name}: The Scorey So Far...`,
          attachments: replyMessage.attachments
        }
        bot.reply(message, slack)
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

  return { getUserEmailArray, updateScoreboard }
}
