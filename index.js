const http2 = require('http2')
const fs = require('fs');

const cert = fs.readFileSync('cert.pem');
const key = fs.readFileSync('key.pem');

const template = fs.readFileSync('index.html', 'utf-8');
const port = process.env.NOPORT ? '' : `:${process.env.PORT || 3000}`
const rootUrl = `https://${process.env.HOST || 'localhost'}${port}`;
const macCommand = `script -F | tee /dev/tty | curl --no-progress-meter -T - ${rootUrl}`;
const linuxCommand = `script -B /dev/stdout | tee /dev/tty | curl --no-progress-meter -T - ${rootUrl}`


if (typeof String.prototype.replaceAll !== 'function') {
    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
    }

    String.prototype.replaceAll = function (search, replacement) {
        let target = this;
        return target.replace(new RegExp(escapeRegExp(search), 'g'), replacement);
    };
}

const html = template.replaceAll('$$LINUX_COMMAND$$', linuxCommand).replaceAll('$$MAC_COMMAND$$', macCommand);
const sessions = new Map();
let sseClientId = 0;
const server = http2.createSecureServer({key, cert}, (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
    }
    if (req.method === 'PUT') {
        handleUpload(req, res);
        return;
    }

    if (sessions.has(req.url.substr(1))) {
        handleStream(req, res);
        return;
    }


    const deliverHTML = req.headers['accept'] && req.headers['accept'].split(',')[0] === 'text/html';
    res.statusCode = 200;
    if (deliverHTML) {
        res.setHeader('Content-Type', 'text/html');
        res.write(html);
    } else {
        res.write('Welcome to TermShare!\n\r' +
            'To share your current terminal, run:\n\r' +
            `On MacOS: '${macCommand}'\n\r` +
            `On Linux: '${linuxCommand}'\n\r`);
    }

    res.end();

});

function handleUpload(req, res) {
    console.log('New sharer');
    const sessionId = Math.random().toString(36).substr(2);
    sessions.set(sessionId, new Map());
    console.log(`New session: ${sessionId}`);
    const url = `${rootUrl}/${sessionId}`
    const msg = 'Welcome to TermShare!\n\r' +
        `Watchers need to run 'curl ${url}'\n\r` +
        `To end the session, type 'exit' followed by CTRL+C.\n\r` +
        "Please don't type in any passwords!\n\r" +
        `The Session will be recorded in the file 'typescript' in the current directory.\n\r`
    res.write(msg);
    console.log('Welcome message written.');
    req.on('data', function (chunk) {
        const clients = sessions.get(sessionId);
        for (const client of clients.values()) {
            client.write(chunk);
        }
    });
    req.on("close", () => {
        const session = sessions.get(sessionId);
        for (const client of session.values()) {
            client.write('The host closed the session. Thank you for using TermShare!\n\r');
            client.end();
        }
        sessions.delete(sessionId);
        console.log(`Current number of sessions: ${sessions.size}`);
    });
}

function handleStream(req, res) {
    const sessionId = req.url.substr(1);
    sessions.get(sessionId).set(sseClientId, res);
    res.write('Welcome to TermShare!\n\r');
    sseClientId++;
}

server.listen(process.env.PORT || 3000, () => {
    console.log(`TermShare server running on ${rootUrl}`);
});
