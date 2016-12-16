
import util from 'util';
import _ from 'lodash';
import Botkit from 'botkit';
import mongoStorage from 'botkit-storage-mongo'({mongoUri: process.env.MONGO_URI}),
import config from './config.js';
import ConversationHandler from './conversation.js';


//*************************************************************************************************//


const port = process.env.PORT || process.env.port;

if (!config('SLACK_CLIENT_ID') || !config('SLACK_CLIENT_SECRET') || !config('PORT')) {
  console.log('Error: Specify clientId clientSecret and port in environment');
  process.exit(1);
}

const controller = Botkit.slackbot({
  interactive_replies: true,
  storage: mongoStorage,
}).configureSlackApp({
  clientId: config('SLACK_CLIENT_ID'),
  clientSecret: config('SLACK_CLIENT_SECRET'),
  redirectUri: 'https://karmanage.herokuapp.com/oauth',
  scopes: ['bot', 'incoming-webhook', 'commands', 'chat:write:user', 'chat:write:bot']
});


//*************************************************************************************************//


controller.setupWebserver(port, (err, webserver) => {
  
  controller.createWebhookEndpoints(controller.webserver);
  controller.createOauthEndpoints(controller.webserver, (err, req, res) => {
    if (err) res.status(500).send(`ERROR: ${err}`);
    else res.redirect('https://karmanage.herokuapp.com/success');
  });

  webserver.get('/', (req, res) => {
    res.send( 'NEED BUTTON' );
  });

  webserver.post('/success', (req, res) => {
     res.send('Success! Karma bot has been added to your team');
  });
});


//*************************************************************************************************//

// Handle events related to the websocket connection to Slack
controller.on('rtm_open', bot => {
  console.log('** The RTM api just connected!');
});

controller.on('rtm_close', bot => {
  console.log('** The RTM api just closed');
  // may want to attempt to re-open
});

// simple way to make sure we don't connect to the RTM twice for the same team
const _bots = {};
function trackBot (bot) {
  _bots[bot.config.token] = bot;
}

// simple way to make sure we don't connect our convos to multiple bots
const _convos = {};
function trackConvo (bot, convo) {
  _convos[bot.config.token] = convo;
  trackbot(bot);
}

controller.storage.teams.all((err, teams) => {
  console.log('** connecting teams **\n');
  if (err) {
    throw new Error(err);
  }
  for (const t in teams) {
    if (teams[t].bot) {
      const bot = controller.spawn(teams[t]).startRTM(err => {
        if (err) {
          console.log('Error connecting bot to Slack:', err);
        } else {
          const convo = new ConversationHandler(controller, bot);
          trackConvo(bot, convo);
        }
      });
    }
  }
});

