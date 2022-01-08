const http = require('http');
const fs = require('fs');
const template = fs.readFileSync('index.html', 'utf-8');
const port = process.env.NOPORT ? '' : `:${process.env.PORT || ''}`
const rootUrl = `${process.env.PROTOCOL || 'https'}://${process.env.HOST || 'localhost'}${port}`;
const macCommand = `script -F | tee /dev/tty | curl --no-progress-meter -T - ${rootUrl}`;
const linuxCommand = `script -B /dev/stdout | tee /dev/tty | curl --no-progress-meter -T - ${rootUrl}`
const html = template.replaceAll('$$LINUX_COMMAND$$', linuxCommand).replaceAll('$$MAC_COMMAND$$', macCommand);
const sessions = new Map();
let sseClientId = 0;
const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
    }
    if (req.headers['transfer-encoding'] === 'chunked') {
        handleUpload(req, res);
        return;
    }

    if (sessions.has(req.url.substr(1))) {
        handleStream(req, res);
        return;
    }


    const deliverHTML = req.headers['accept'] && req.headers['accept'].split(',')[0] === 'text/html';
    res.statusCode = 200;
    if(deliverHTML){
        res.setHeader('Content-Type', 'text/html');
        res.write(html);
    } else {
        res.write('Welcome to ShellShare!\n\r' +
            'To share your current terminal, run:\n\r' +
            `On MacOS: '${macCommand}'\n\r` +
            `On Linux: '${linuxCommand}'\n\r`);
    }

    res.end();

});

function handleUpload(req, res) {
    const sessionId = Math.random().toString(36).substr(2);
    sessions.set(sessionId, new Map());
    const url = `${rootUrl}/${sessionId}`
    const msg = 'Welcome to ShellShare!\n\r' +
        `Watchers need to run 'curl ${url}'\n\r` +
        `To end the session, type 'exit' followed by CTRL+C.\n\r` +
        `The Session will be recorded in the file 'typescript' in the current directory.\n\r`
    res.write(msg);
    req.on('data', function (chunk) {
        const clients = sessions.get(sessionId);
        for (const client of clients.values()) {
            client.write(chunk);
        }
    });
}

function handleStream(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // needed for nginx

        // enabling CORS
        'Access-Control-Allow-Origin': "*",
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Last-Event-ID'
    });
    const sessionId = req.url.substr(1);
    sessions.get(sessionId).set(sseClientId, res);

    ((currentId) => {
        req.on("close", () => {
            sessions.get(sessionId).delete(currentId);
        });
    })(sseClientId);
    sseClientId++;
}

server.listen(process.env.PORT || 3000, () => {
    console.log(`ShellShare server running on port: ${process.env.PORT || 3000}`);
});
