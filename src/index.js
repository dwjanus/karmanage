
import _ from 'lodash'
import Botkit from 'botkit'
import mongo from 'botkit-storage-mongo'
import config from './config.js'
import ConversationHandler from './conversation.js'

/*************************************************************************************************/

const mongoStorage = mongo({mongoUri: config('MONGODB_URI')})
const port = process.env.PORT || process.env.port

if (!config('SLACK_CLIENT_ID') || !config('SLACK_CLIENT_SECRET') || !config('PORT')) {
  console.log('Error: Specify clientId clientSecret and port in environment')
  process.exit(1)
}

const controller = Botkit.slackbot({
  interactive_replies: true,
  storage: mongoStorage
}).configureSlackApp({
  clientId: config('SLACK_CLIENT_ID'),
  clientSecret: config('SLACK_CLIENT_SECRET'),
  redirectUri: 'https://karmanage.herokuapp.com/oauth',
  scopes: ['bot', 'incoming-webhook', 'commands', 'chat:write:user', 'chat:write:bot']
})

/*************************************************************************************************/

controller.setupWebserver(port, (err, webserver) => {
  if (err) console.log(err)
  controller.createWebhookEndpoints(controller.webserver)
  controller.createOauthEndpoints(controller.webserver, (err, req, res) => {
    if (err) res.status(500).send(`ERROR: ${err}`)
    else res.redirect('https://karmanage.herokuapp.com/success')
  })

  webserver.get('/', (req, res) => {
    res.send('<a href="https://slack.com/oauth/authorize?scope=incoming-webhook,' +
      'commands,bot&client_id=64177576980.117306046992"><img alt="Add to Slack" ' +
      'height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" ' +
      'srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x,' +
      'https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>')
  })

  webserver.get('/success', (req, res) => {
    res.send('Success! Karma bot has been added to your team')
  })
})

/*************************************************************************************************/

// quick greeting/create convo on new bot creation
controller.on('create_bot', (bot, config) => {
  console.log('** bot is being created **\n')
  if (_bots[bot.config.token]) { // do nothing
  } else {
    bot.startRTM(err => {
      if (!err) {
        if (_convos[bot.config.token]) {  // do nothing
          trackBot(bot)
        } else {
          const convo = new ConversationHandler(controller, bot)
          trackConvo(bot, convo)
        }
      }
      bot.startPrivateConversation({user: config.createdBy}, (err, convo) => {
        if (err) {
          console.log(err)
        } else {
          convo.say('I am a bot that has just joined your team')
          convo.say('You must now /invite me to a channel so that I can be of use!')
        }
      })
    })
  }
})

// Handle events related to the websocket connection to Slack
controller.on('rtm_open', bot => {
  console.log('** The RTM api just connected!')
})

controller.on('rtm_close', bot => {
  console.log('** The RTM api just closed')
  // may want to attempt to re-open
})

// simple way to make sure we don't connect to the RTM twice for the same team
const _bots = {}
function trackBot (bot) {
  _bots[bot.config.token] = bot
}

// simple way to make sure we don't connect our convos to multiple bots
const _convos = {}
function trackConvo (bot, convo) {
  _convos[bot.config.token] = convo
  trackBot(bot)
}

controller.storage.teams.all((err, teams) => {
  console.log('** connecting teams **\n')
  if (err) {
    throw new Error(err)
  }
  for (const t in teams) {
    if (teams[t].bot) {
      const bot = controller.spawn(teams[t]).startRTM(err => {
        if (err) {
          console.log('Error connecting bot to Slack:', err)
        } else {
          const convo = new ConversationHandler(controller, bot)
          trackConvo(bot, convo)
        }
      })
    }
  }
})

