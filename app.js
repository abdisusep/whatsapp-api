const { Client } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

process.setMaxListeners(0);

app.use(express.static('public'))

const SESSION_FILE_PATH = './sesi.json';
let sessionData;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionData = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
  },
  session: sessionData
});


client.initialize();

// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Menghubungkan...');

  client.on('qr', (qr) => {
    console.log('QRCode tersedia :', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code tersedia!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp sudah siap!');
    socket.emit('message', 'Whatsapp sudah siap!');
  });

  client.on('authenticated', (session) => {
    socket.emit('authenticated', 'Whatsapp sudah autentikasi!');
    socket.emit('message', 'Whatsapp sudah autentikasi!');
    console.log('AUTHENTICATED', session);
    sessionData = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), (err) => {
      socket.emit('message', 'Sesi berhasil dibuat!');
      console.log('Sesi berhasil dibuat!');
      if (err) {
        console.error(err);
      }
    });
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Autentikasi gagal, ulangi...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp tidak konek!');
    try {
      fs.unlinkSync(SESSION_FILE_PATH)
      socket.emit('message', 'Sesi berhasil dihapus!');
      console.log('Sesi berhasil dihapus!');
      client.initialize();
    } catch(err) {
      console.error(err)
    }
  });
});


const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

// Send message
app.post('/kirim-pesan', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'Nomor tidak terdaftar!'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

server.listen(port, function() {
  console.log('Aplikasi berjalan pada http://localhost:' + port);
});
