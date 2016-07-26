var config = require("./data/config.json");
var needle = require("needle")
var unzip = require("unzip");
var fs = require('fs');

var current = {};

function checkLatest(err, resp, data) {
    var platform = data.name.split(' ').shift();
    if ((current[platform] === undefined) || (current[platform] != data.tag_name)) {
        current[platform] = data.tag_name;
        fs.writeFile('./data/current.json', JSON.stringify(current));
        console.log("Got new version for " + platform + " - " + data.tag_name);
    
        for (var i = 0; i < data.assets.length; i++) {
            var asset = data.assets[i];
            var assetName = asset.name.split('-');
            if ((asset.name.substr(asset.name.length - 4, 4) !== ".zip") || (assetName[3] !== "pico"))
            { continue; }
            var platform = assetName[1];
            var android = assetName[2]
            downloadRelease(asset.browser_download_url, platform, android)
                .then(file => { unpackZIP(file, platform, android); })
                .then(path => { alert("Unpacked to " + path); })
                ;
        }
    }
}

function downloadRelease(url, platform, android) {
    return new Promise(
        function (resolve, reject) {
            console.log("Downloading " + url);
            var zip = "./files/" + platform + "_" + android + ".zip";
            needle.get(url, { output: zip, follow: 5 }, function (err, resp, data) {
                if (err) {
                    reject('Error:' + err);
                }
                if (!err && resp.statusCode == 200) {
                    console.log("Downloaded " + zip);
                    resolve(zip);
                }
            });
        });
}

function unpackZIP(file, platform, android) {
    return new Promise(
        function (resolve, reject) {
            var path = fs.mkdtemp('./files/tmp/zip-');
            try {
                console.log("Starting unzip file: ", file)
                var unzipExtractor = unzip.Extract({ path: path });
                unzipExtractor.on('error', reject('Error:' + err));
                unzipExtractor.on('close', resolve(path));
                fs.createReadStream(file).pipe(unzipExtractor);
            } catch (err) {
                reject('Error:' + err);
            }
        });
}

//============================
//Run application
if (fs.existsSync("./data/current.json")) {
    current = JSON.parse(fs.readFileSync("./data/current.json"));
}
config.platform.forEach(function (platform) {
    if (!fs.existsSync("./files/releases/" + platform)) {
        fs.mkdir("./files/releases/" + platform);
    }
    needle.get("https://api.github.com/repos/opengapps/" + platform + "/releases/latest", checkLatest);
}, this);
//============================

//Methods that don't work sync, only async
var extensions = [".xz", ".tar", ".apk"];

//TODO: Review with promises
function unpackAndDeleteXZ(startLocation, extensions ) {
    if(!fs.existsSync(startLocation)) {
        console.log("no dir: ", startLocation);
        return;
    }
    var files = fs.readdirSync(startLocation);

    for (var i = 0; i < files.length; i++) {

        var filename = path.join(startLocation, files[i]);
        var stat = fs.lstatSync(filename);

        try {
            //find all .xz files and extract them into the same location
            if (stat.isDirectory()) {
                unpackAndDeleteXZ(filename, extensions);
            } else if (filename.indexOf(extensions[0]) >=0){

                //this lib when unpacked .xz file needs new name of file
                //so we delete ".xz", unpacked and get .tar file
                var newFileName = filename.replace(extensions[0], "");

                unpackXZ(filename, newFileName);

                fs.unlink(filename);
            }
        } catch (e) {
            console.log("Err: ", e);
        }
    }
}

//TODO: Review with promises
function unpackXZ (xzFile, newFile) {
    var compressor = lzma.createDecompressor();

    var input = fs.createReadStream(xzFile);
    var output = fs.createWriteStream(newFile);

    input.pipe(compressor).pipe(output);
}

//TODO: Review with promises
function unpackAndDeleteTAR(startLocation, extensions) {
    if(!fs.existsSync(startLocation)) {
        console.log("no dir: ", startLocation);
        return;
    }
    var files = fs.readdirSync(startLocation);

    for (var i = 0; i < files.length; i++) {

        var filename = path.join(startLocation, files[i]);
        var stat = fs.lstatSync(filename);

        try {
            //find all .tar files and extract them to tmp
            if (stat.isDirectory()) {
                unpackAndDeleteTAR(filename, extensions);
            } else if (filename.indexOf(extensions[1]) >=0){


                fs.createReadStream(filename).pipe(tar.extract("./files/tmp"));
            }
        } catch (e) {
            console.log("Err: ", e);
        }

    }
}
//TODO: Review with promises
//when you extract all archives (.zip, .xz, .tar), move all your apk into one folder
//and after that use upload() to upload to server
function moveAllApkIntoFolder(folder, extensions) {
    var files = fs.readdirSync(folder);

    for (var i = 0; i < files.length; i++) {
        var filename = path.join(folder, files[i]);
        var stat = fs.lstatSync(filename);

        try {
            if (stat.isDirectory()) {
                moveAllApkIntoFolder(filename);
            } else if (filename.indexOf(extensions[2]) >=0){
                var newFileName = path.basename(filename);
                fs.createReadStream(filename).pipe(fs.createWriteStream("./files/upload/" + newFileName));;
            }
        } catch (e) {
            console.log("Err: ", e);
        }

    }
}
//use this function to delete all files and subfolders in folder
function deleteAllFilesAndFoldersInFolder (path) {
    if( fs.existsSync(path) ) {
        fs.readdirSync(path).forEach(function(file,index){
            var curPath = path + "/" + file;
            if(fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteAllFilesAndFoldersInFolder(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.readdirSync(path).forEach(function(file,index){
            var curPath = path + "/" + file;
            fs.rmdirSync(curPath);
        });

    }
};

//TODO: Review with promises
function uploadApk (platform, osversion) {
    var folder = "./files/upload/";

    AWS.config.loadFromPath("./config/aws3.json");

    var zlib = require('zlib');

    var files = fs.readdirSync(folder);

    for (var i = 0; i < files.length; i++) {
        var filenameUrl = path.join(folder, files[i]);
        var filename = path.basename(filenameUrl);

        var body = fs.createReadStream("./files/upload/" + filename).pipe(zlib.createGzip());
        var s3obj = new AWS.S3({params: {Bucket: "googleinstaller", Key: platform + "/" + osversion + "/" + filename}});
        s3obj.upload({Body: body}).
        on("httpUploadProgress", function(evt) { console.log(evt); }).
        send(function(err, data) { console.log(err, data) });

        fs.unlink(filenameUrl);
    }
}