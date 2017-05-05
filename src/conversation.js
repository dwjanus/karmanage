
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

const ordinal_suffix_of = (i) => {
    let j = i % 10,
        k = i % 100
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd"
    }
    if (j == 3 && k != 13) {
        return i + "rd"
    }
    return i + "th"
}

export default (controller, bot) => {
  const buildUserArray = (bot) => {
    bot.api.users.list({}, (err, response) => {
      if (err) console.log(err)
      if (response.hasOwnProperty('members') && response.ok) {
        for (let i = 0; i < response.members.length; i++) {
          let member = response.members[i]
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
                if (user && (user.karma !== null)) newMember.karma = user.karma
                else console.log('user not found in db')
                controller.storage.users.save(newMember)
                console.log(`${newMember.fullName} saved`)
              })
            }
          }
        }
      }
    })
  }

  controller.hears(['(^help$)'], ['direct_message', 'direct_mention'], (bot, message) => {
    // this may not work
    bot.reply = message.event === 'direct_message' ? bot.reply : bot.replyInThread
    let attachments = [
      {
        title: 'Help',
        color: '#0067B3',
        text: 'Simply react to a message with :+1: or ' +
              '@mention someone with a :+1:, \'+1\', or \'++\' to give that person a karma point. ' +
              'Direct message/mention Karmabot or use a slash command to ' +
              'view points.\n',
        fields: [
          {
            title: 'Example', // maybe make this a gif or jpg?
            value: 'Joseph Smith: @karmabot: how much karma do I have?\n' +
                   'Karma Bot: You have 15 karma!\n',
            short: false
          }
        ]
      },
      {
        title: 'Slash Command Reference',
        color: '#009999',
        text: '_/mykarma_ - for your individual score\n' +
              '_/scoreboard_ - to see where you stack up\n',
        footer: 'Devin Janus  |  Karmabot - v. 1.0 |',
        footer_icon: 'https://karmanage.herokuapp.com/images/smashing-emoji.png',
        ts: 123456789,
        mrkdwn_in: ['text', 'pretext']
      }
    ]

    let replyWithAttachments = {
      pretext: '*Karmabot help*',
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
    bot.reply(message, {text: 'What it do fam'})
  })

  controller.hears(['my karma', 'my score', 'my rank'], ['direct_message', 'direct_mention'], (bot, message) => {
    if (message.event !== 'direct_message') bot.reply = bot.replyInThread
    controller.storage.scores.get(message.team, (err, scores) => {
      if (err) console.log(err)
      let found = _.find(scores.ordered, (o) => { return o.user_id == message.user })
      let place = ordinal_suffix_of(found.rank_index + 1)
      let response = { text: `You are currently in ${place} with ${found.karma} karma` }
      bot.reply(message, response)
    })
  })

  controller.hears(['admin'], ['direct_message'], (bot, message) => {
    controller.storage.teams.get(message.team, (err, team) => {
      if (err) console.log(err)
      dbScoreboard(team.id).then((ordered) => {
        team.scoreboard = ordered
        controller.storage.teams.save(team)
        controller.storage.users.get(message.user, (err, user) => {
          if (err) console.log(err)
          if (user.is_admin || user.id == 'U1EG4KCS1') {
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
            bot.startPrivateConversation({ user: message.user }, (error, convo) => {
              if (error) {
                console.log(error)
              } else {
                convo.say('I am sorry, that command is reserved for team admins')
              }
            })
          }
        })
      })
    })
  })

  controller.hears(['scoreboard', 'scores'], ['direct_message', 'direct_mention'], (bot, message) => {
    console.log('[conversation] ** scoreboard heard **')
    if (message.event !== 'direct_message') bot.reply = bot.replyInThread
    controller.storage.teams.get(message.team, (err, team) => {
      if (err) console.log(err)
      controller.storage.users.get(message.user, (err, user) => {
        if (err) console.log(err)
        if (user.is_admin) {
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

  // Handles adding karma via @mention
  controller.hears([':\\+1:', '\\+\\+', '\\+1'], ['ambient', 'direct_mention', 'direct_message'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      processUsers(rawIds).then(ids => {
        for (let i in ids) {
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
  controller.hears([':\\-1:', '\\-\\-', '\\-1'], ['ambient', 'direct_mention', 'direct_message'], (bot, message) => {
    const rawIds = _.map(message.text.match(/<@([A-Z0-9])+>/igm))
    if (rawIds.length > 0) {
      processUsers(rawIds).then(ids => {
        for (let i in ids) {
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
    dbScoreboard(message.team).then((ordered) => {
      console.log(`dbScoreboard done and new ranks applied`)
    })
  })

  controller.on('slash_command', (bot, message) => {
    if (message.command === '/mykarma') {
      controller.storage.scores.get(message.team_id, (err, scores) => {
        if (err) console.log(err)
        let found = _.find(scores.ordered, (o) => { return o.user_id == message.user })
        let place = ordinal_suffix_of(found.rank_index + 1)
        bot.replyPrivate(message, `You are currently in ${place} with ${found.karma} karma`)
      })
    }
    if (message.command === '/scoreboard') {
      controller.storage.teams.get(message.team_id, (err, team) => {
        if (err) console.log(err)
        dbScoreboard(team.id).then((ordered) => {
          team.scoreboard = ordered
          controller.storage.teams.save(team)
          controller.storage.users.get(message.user, (err, user) => {
            if (err) console.log(err)
            if (user.is_admin) { // || user.id == U1EG4KCS1
              buildScoreboard(team).then((replyMessage) => {
                const slack = {
                  text: `${team.name}: The Scorey So Far...`,
                  attachments: replyMessage.attachments
                }
                bot.replyPrivate(message, replyMessage)
              })
              .catch((err) => {
                console.log(err)
              })
            } else {
              buildLimitedScoreboard(team, user).then((replyMessage) => {
                const slack = {
                  text: `${team.name}: The Scorey So Far...`,
                  attachments: replyMessage.attachments
                }
                bot.replyPrivate(message, replyMessage)
              })
              .catch((err) => {
                console.log(err)
              })
            }
          })
        })
        .catch((err) => {
          console.log(err)
        })
      })
    }
  })

  return { buildUserArray }
}
