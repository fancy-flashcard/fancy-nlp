const express = require('express')
const bodyParser = require('body-parser')
const { NlpManager } = require('node-nlp');
const http = require('http')
const https = require('https')
const app = express()
let port = (process.argv[2] === undefined) ? 4443 : process.argv[2]
const fs = require('fs')
const path = require('path')

const handles = []

let readyForMore = true

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post('/train', async (req, res) => {

    if (readyForMore) {
        const handle = {
            clientId: Date.now().toString(),
            manager: new NlpManager({ languages: req.body.languageCodes })
        }

        for (const document of req.body.documents) {
            handle.manager.addDocument(document.languageCode, document.input, document.intent);
        }
        for (const answer of req.body.answers) {
            handle.manager.addAnswer(answer.languageCode, answer.intent, answer.output);
        }

        await handle.manager.train()

        handles.push(handle)

        res.send({ clientId: handle.clientId })

        limitNumberOfActiveClients() // shall be optimized soon
    } else {
        res.send('give me a break')
    }
})

app.post('/fundclient/clientId/:clientId', async (req, res) => {

    const fundingsFilePath = path.join(`${__dirname}`, 'operational-data/fundings.json')

    const newFunding = req.body
    newFunding.id = Date.now().toString()

    const fileContent = JSON.parse(fs.readFileSync(fundingsFilePath, 'utf8'))
    fileContent.push(newFunding)

    fs.writeFileSync(fundingsFilePath, JSON.stringify(fileContent))
    res.send(newFunding)

})

app.get('/process/input/:input/languageCode/:languageCode/clientId/:clientId', async (req, res) => {

    const handle = handles.filter((e) => e.clientId === req.params.clientId)[0]
    if (handle === undefined) {
        res.send(`Are you sure you submitted a valid clientId?: ${req.params.clientId} - try training again and save the return value`)
    }
    const nlpResult = await handle.manager.process(req.params.languageCode, req.params.input)
    res.send({ nlpResult })
})

app.get('/getFundings/clientId/:clientId', async (req, res) => {
    const fundingsFilePath = path.join(`${__dirname}`, 'operational-data/fundings.json')
    console.log(``)
    const fileContent = fs.readFileSync(fundingsFilePath, 'utf8')
    res.send(fileContent)
})


function limitNumberOfActiveClients() {
    if (handles.length > 100) {
        handles.splice(0, 1)
        readyForMore = false
        setTimeout(() => {
            readyForMore = true
        }, 60 * 1000)
    }
}

if (port === 4443) {
    https.createServer({
        cert: fs.readFileSync('/etc/letsencrypt/live/fancy-chats.com/fullchain.pem'),
        key: fs.readFileSync('/etc/letsencrypt/live/fancy-chats.com/privkey.pem')
    }, app).listen(port)

} else {
    http.createServer(app).listen(port)
}



