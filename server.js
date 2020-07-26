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

const balancesFilePath = path.join(`${__dirname}`, 'operational-data/balances.json')
const messagesFilePath = path.join(`${__dirname}`, 'operational-data/messages.json')
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

        const newBalance = {
            clientId: handle.clientId,
            balanceInEuro: 0,
            fundings: []
        }

        const balances = JSON.parse(fs.readFileSync(balancesFilePath, 'utf-8'))
        balances.push(newBalance)
        fs.writeFileSync(balancesFilePath, JSON.stringify(balances))

        limitNumberOfActiveClients() // shall be optimized soon

        res.send({ clientId: handle.clientId })

    } else {
        res.send('give me a break')
    }
})

app.post('/fundclient/clientId/:clientId', async (req, res) => {

    const newFunding = req.body
    newFunding.id = Date.now().toString()

    const balances = JSON.parse(fs.readFileSync(balancesFilePath, 'utf8'))
    const theOne = balances.filter((e) => e.clientId === req.params.clientId)[0]
    theOne.balance = theOne.balance + newFunding.amountInEuro
    theOne.fundings.push(newFunding)

    const index = balances.indexOf(theOne)
    balances.splice(index, 1)
    balances.push(theOne)

    fs.writeFileSync(balancesFilePath, JSON.stringify(balances))
    res.send(newFunding)
})

app.get('/process/input/:input/languageCode/:languageCode/clientId/:clientId', async (req, res) => {

    const handle = handles.filter((e) => e.clientId === req.params.clientId)[0]
    if (handle === undefined) {
        res.send(`Are you sure you submitted a valid clientId?: ${req.params.clientId} - try training again and save the return value`)
    }
    const nlpResult = await handle.manager.process(req.params.languageCode, req.params.input)

    const message = {
        clientId: req.params.clientId,
        timeStamp: Date.now().toString(),
        languageCode: req.params.languageCode,
        input: req.params.input,
        output: nlpResult.answer
    }

    const messages = JSON.parse(fs.readFileSync(messagesFilePath, 'utf-8'))
    messages.push(message)
    fs.writeFileSync(messagesFilePath, JSON.stringify(messages))


    const balances = JSON.parse(fs.readFileSync(balancesFilePath, 'utf8'))
    const theOne = balances.filter((e) => e.clientId === req.params.clientId)[0]
    theOne.balanceInEuro = Number(theOne.balanceInEuro) - 0.01

    const index = balances.indexOf(theOne)
    balances.splice(index, 1)
    balances.push(theOne)

    console.log(theOne)
    console.log(balances)
    fs.writeFileSync(balancesFilePath, JSON.stringify(balances))

    res.send({ nlpResult })
})

app.get('/getBalance/clientId/:clientId', async (req, res) => {
    const fileContent = fs.readFileSync(balancesFilePath, 'utf8')
    res.send(fileContent)
})

app.get('/getMessages/clientId/:clientId', async (req, res) => {
    const fileContent = fs.readFileSync(messagesFilePath, 'utf8')
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



