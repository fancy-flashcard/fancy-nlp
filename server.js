const express = require('express')
const bodyParser = require('body-parser')
const { NlpManager } = require('node-nlp');

const app = express()
const port = 4443

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


app.get('/process/input/:input/languageCode/:languageCode/clientId/:clientId', async (req, res) => {

    const handle = handles.filter((e) => e.clientId === req.params.clientId)[0]
    if (handle === undefined) {
        res.send(`Are you sure you submitted a valid clientId?: ${req.params.clientId} - try training again and save the return value`)
    }
    const nlpResult = await handle.manager.process(req.params.languageCode, req.params.input)
    res.send({ nlpResult })
})


function limitNumberOfActiveClients() {
    if (handles.length > 10000) {
        handles.splice(0, 1)
    }
    readyForMore = false
    setTimeout(() => {
        readyForMore = true
    }, 60 * 1000)
}


app.listen(port, () => console.log(`Fancy NLP server listening at http://localhost:${port}`))

