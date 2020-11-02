const io = require('socket.io') ({path:'/recording.io'});

const fs = require('fs');

const SESSION_ASSET_DIR = "/Users/pmpower/assets/sessions";
const PROGRAM_ASSET_DIR = "/Users/pmpower/assets/programs";

var spawn = require('child_process').spawn;

spawn('ffmpeg',['-h']).on('error',function(msg){
	console.error("FFMpeg not found in system cli; please install ffmpeg properly or make a softlink to ./!");
	process.exit(-1);
});

/**
 * Initialize when a connection is made
 * 
 * @param {SocketIO.Socket} socket
 */
function initSocket(socket) {
    var ffmpegProcess, feedStream = false;

    socket.on('recording_config', function (msg) {
        socket.rtmpUrl = msg.rtmpUrl;
        socket.outFile = msg.outFile;

        socket.emit('message', 'Output destination is set to:' + socket.outFile);
    });

    socket.on('start', function (msg) {

        if (ffmpegProcess || feedStream) {
            socket.emit('fatal', 'stream is already available and started.');
            return;
        }

        var ops = [
            '-i', '-',
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',  // video codec config: low latency, adaptive bitrate
            '-c:a', 'aac', '-ar', '44100', '-b:a', '64k', // audio codec config: sampling frequency (11025, 22050, 44100), bitrate 64 kbits
            '-y', //force to overwrite
            '-use_wallclock_as_timestamps', '1', // used for audio sync
            '-async', '1', // used for audio sync
            //'-filter_complex', 'aresample=44100', // resample audio to 44100Hz, needed if input is not 44100
            //'-strict', 'experimental', 
            '-bufsize', '1000',
            //'-f', 'flv', socket.rtmpUrl,
            '-map','0',socket.outFile
        ];

        ffmpegProcess = spawn('ffmpeg', ops);

        feedStream = function (data) {
            ffmpegProcess.stdin.write(data);
        }

        ffmpegProcess.stderr.on('data', function (data) {
            socket.emit('ffmpeg_stderr', '' + data);
        });

        ffmpegProcess.on('error', function (e) {
            console.log('child process error' + e);
            socket.emit('fatal', 'ffmpeg error!' + e);
            feedStream = false;
            socket.disconnect();
        });

        ffmpegProcess.on('exit', function (e) {
            console.log('child process exit' + e);
            socket.emit('fatal', 'ffmpeg exit!' + e);
            socket.disconnect();
        });

    });

    socket.on('binarystream', function (data) {
        if (!feedStream) {
            socket.emit('fatal', 'Feed Stream is not set');
            ffmpegProcess.stdin.end();
            ffmpegProcess.kill('SIGINT');
            return;
        }
        feedStream(data);
    });

    socket.on('disconnect', function () {
        feedStream = false;
        if (ffmpegProcess) {
            try {
                ffmpegProcess.stdin.end();
                ffmpegProcess.kill('SIGINT');
            }
            catch (e) {
                console.warn('Attempt to kill the spawned ffmpeg process is failed.');
            }
        }
    });
}

process.on('uncaughtException', function(err) {
    // handle the error safely
    console.log(err)
    // Note: after client disconnect, the subprocess will cause an Error EPIPE, which can only be caught this way.
})

module.exports = (server) => {
    io.listen(server, { log: true })
        .on('connection', initSocket);
};
