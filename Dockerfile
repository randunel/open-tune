from node:4.2.2

RUN apt-get update && apt-get install openvpn -y

COPY package.json /src/package.json
RUN cd /src; npm install

RUN apt-get install iptables traceroute -y

COPY . /src
WORKDIR /src

CMD ["./node_modules/.bin/mocha", "test/*.test.js", "--timeout", "30000"]
# CMD ["/bin/bash"]
