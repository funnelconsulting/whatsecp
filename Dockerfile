# Use Node.js 22 as base
FROM node:22

# Install dependencies for Chrome
# RUN apt-get update && apt-get install -y \
#     wget gnupg ca-certificates \
#     fonts-liberation libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
#     libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 \
#     libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
#     libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
#     libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
#     xdg-utils lsb-release unzip \
#     && rm -rf /var/lib/apt/lists/*

# # Install latest stable Google Chrome
# RUN wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux.gpg \
#     && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
#     > /etc/apt/sources.list.d/google-chrome.list \
#     && apt-get update && apt-get install -y google-chrome-stable \
#     && rm -rf /var/lib/apt/lists/*

# Copy app source
COPY . /usr/src/app

# Set working directory
WORKDIR /usr/src/app

# Copy package manager lock (optional optimization)
# COPY package.json pnpm-lock.yaml* ./

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN npx --yes @puppeteer/browsers@latest install chrome@139.0.7258.154;
RUN apt-get update;

RUN apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 \
libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgconf-2-4 \
libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
libxss1 libxtst6 ca-certificates fonts-liberation libnss3 lsb-release \
xdg-utils wget
RUN apt-get install -y fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 --no-install-recommends;



# # Install Chrome from your script
# RUN chmod +x ./install-chrome.bash
# RUN ./install-chrome.bash

# Install dependencies
RUN corepack pnpm install

CMD ["corepack", "pnpm", "run", "start"]