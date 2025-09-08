set -e

npx --yes @puppeteer/browsers@latest install chrome@139.0.7258.154;
apt-get update;
apt-get install -y fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 --no-install-recommends;
