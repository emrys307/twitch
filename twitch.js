//const execa = require('execa');
const https = require('https');

const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";

function getAccessToken(id, isVod) {
	const data = JSON.stringify({
		operationName: "PlaybackAccessToken",
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash: "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712"
			}
		},
		variables: {
			isLive: !isVod,
			login: (isVod ? "" : id),
			isVod: isVod,
			vodID: (isVod ? id : ""),
			playerType: "embed"
		}
	});

	const options = {
		hostname: 'gql.twitch.tv',
		port: 443,
		path: '/gql',
		method: 'POST',
		headers: {
			'Client-id': clientId
		}
	};

	return new Promise((resolve, reject) => {
		const req = https.request(options, (response) => {
			var resData = {};
			resData.statusCode = response.statusCode;
			resData.body = [];
			response.on('data', (chunk) => resData.body.push(chunk));
			response.on('end', () => {
				resData.body = resData.body.join('');

				if (resData.statusCode != 200) {
					reject(new Error(`${JSON.parse(data.body).message}`));
				} else {
					if (isVod) {
						resolve(JSON.parse(resData.body).data.videoPlaybackAccessToken);
					} else {
						resolve(JSON.parse(resData.body).data.streamPlaybackAccessToken);
					}
				}
			});
		});

		req.on('error', (error) => reject(error));
		req.write(data);
		req.end();
	});
}

function getPlaylist(id, accessToken, vod) {
	return new Promise((resolve, reject) => {
		const req = https.get(`https://usher.ttvnw.net/${vod ? 'vod' : 'api/channel/hls'}/${id}.m3u8?client_id=${clientId}&token=${accessToken.value}&sig=${accessToken.signature}&allow_source=true&allow_audio_only=true`, (response) => {
			let data = {};
			data.statusCode = response.statusCode;
			data.body = [];
			response.on('data', (chunk) => data.body.push(chunk));
			response.on('end', () => {
				data.body = data.body.join('');

				switch (data.statusCode) {
					case 200:
						resolve(resolve(data.body));
						break;
					case 404:
						reject(new Error('Transcode does not exist - the stream is probably offline'));
						break;
					default:
						reject(new Error(`Twitch returned status code ${data.statusCode}`));
						break;
				}
			});
		})
			.on('error', (error) => reject(error));

		req.end()
	});
}

function parsePlaylist(playlist) {
	const parsedPlaylist = [];
	const lines = playlist.split('\n');
	for (let i = 4; i < lines.length; i += 3) {
		parsedPlaylist.push({
			quality: lines[i - 2].split('NAME="')[1].split('"')[0],
			resolution: (lines[i - 1].indexOf('RESOLUTION') != -1 ? lines[i - 1].split('RESOLUTION=')[1].split(',')[0] : null),
			url: lines[i]
		});
	}
	return parsedPlaylist;
}

function getStream(channel, raw) {
	return new Promise((resolve, reject) => {
		getAccessToken(channel, false)
			.then((accessToken) => getPlaylist(channel, accessToken, false))
			.then((playlist) => resolve((raw ? playlist : parsePlaylist(playlist))))
			.catch(error => reject(error));
	});
}

function getVod(vid, raw) {
	return new Promise((resolve, reject) => {
		getAccessToken(vid, true)
			.then((accessToken) => getPlaylist(vid, accessToken, true))
			.then((playlist) => resolve((raw ? playlist : parsePlaylist(playlist))))
			.catch(error => reject(error));
	});
}

function getTwitchSource(input) {
	let videoId = '';
	let channel = '';
  
	if (input.includes('/videos/') || input.includes('video=')) {
	  const regexVideoId = /(?:\/videos\/|video=)(\d+)/;
	  const match = input.match(regexVideoId);
	  if (match) {
		videoId = match[1];
	  }
	} else if (input.includes('twitch.tv/') || input.includes('channel=')) {
	  const regexChannel = /(?:twitch\.tv\/|channel=)([^&?/]+)/;
	  const match = input.match(regexChannel);
	  if (match) {
		channel = match[1];
	  }
	}
  
	if (videoId) {
	  twitch.getVod(videoId)
		.then((data) => {
		  const qualitySource = data.find(stream => stream.quality.toLowerCase().includes('source'));
		  if (qualitySource) {
			console.log(qualitySource.url);
		  } else {
			console.error('Source version not found.');
		  }
		})
		.catch((err) => console.error(err));
	} else if (channel) {
	  twitch.getStream(channel)
		.then((data) => {
		  const qualitySource = data.find(stream => stream.quality.toLowerCase().includes('source'));
		  if (qualitySource) {
			console.log(qualitySource.url);
		  } else {
			console.error('Source version not found.');
		  }
		})
		.catch((err) => console.error(err));
	} else {
	  console.error('Invalid Twitch link. Please provide a valid Twitch stream or VOD link.');
	}
  }
  
async function main() {
    const { execa } = await import("execa");
    try {
        const copiedItem = await execa('termux-clipboard-get');
        getTwitchSource(copiedItem);
    } catch (error) {
        console.error('Error reading from clipboard:', error);
    }
}

main();
