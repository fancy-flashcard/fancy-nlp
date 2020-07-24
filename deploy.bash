cd /root/fancy-nlp
git stash
./topsecret/pull.sh

cd /root/fancy-nlp
npm config set ignore-scripts true
npm i
npm config set ignore-scripts false

pm2 restart fancy-nlp