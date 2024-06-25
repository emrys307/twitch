const https = require('https');
const { execSync } = require('child_process');

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

const getClipboard = () => {
    return new Promise((resolve, reject) => {
        exec('termux-clipboard-get', (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else if (stderr) {
                reject(stderr);
            } else {
                resolve(stdout.trim());
            }
        });
    });
};

const extractIdFromLink = (input, regexPattern) => {
    const match = input.match(regexPattern);
    return match ? match[1] : '';
};

const getTwitchContent = async () => {
    try {
        const clipboardContent = await getClipboard();

        if (!clipboardContent) {
            console.error('Clipboard is empty. Please copy a Twitch stream or VOD link.');
            process.exit(1);
        }

        let videoId = '';
        let channel = '';

        if (clipboardContent.includes('/videos/') || clipboardContent.includes('video=')) {
            videoId = extractIdFromLink(clipboardContent, /(?:\/videos\/|video=)(\d+)/);
        } else if (clipboardContent.includes('twitch.tv/') || clipboardContent.includes('channel=')) {
            channel = extractIdFromLink(clipboardContent, /(?:twitch\.tv\/|channel=)([^&?/]+)/);
        }

        if (videoId) {
            return twitch.getVod(videoId);
        } else if (channel) {
            return twitch.getStream(channel);
        } else {
            console.error('Invalid Twitch link. Please provide a valid Twitch stream or VOD link.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error reading from clipboard:', error);
        process.exit(1);
    }
};

const main = async () => {
    try {
        const twitchContent = await getTwitchContent();

        const qualitySource = twitchContent.find(stream => stream.quality.toLowerCase().includes('source'));
        if (qualitySource) {
            console.log(qualitySource.url);
        } else {
            console.error('Source version not found.');
        }
    } catch (err) {
        console.error(err);
    }
};

main();
