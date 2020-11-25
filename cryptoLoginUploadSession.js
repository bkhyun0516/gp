var express =require('express');
var http = require('http');
var path = require('path');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var static  = require('serve-static');
var expressErrorHandler = require('express-error-handler');
var expressSession = require('express-session');
var crypto = require('crypto');
var app = express();
var MongoClient = require('mongodb').MongoClient;
var multer = require('multer');
var fs = require('fs');
var cors = require('cors');
var mykey = '###3333###';
var axios = require("axios");
app.set('port',3000);

var database;
var UserSchema;
var fileSchema;
var pageSchema;
var UserModel;
var fileModel;
var pageModel;

function connectDB() {
    var databaseUrl = 'mongodb://localhost:27017/project';
    mongoose.connect(databaseUrl);
    database = mongoose.connection;
    database.error(console.error.bind(console,'연결장애'));
    database.on('open',function () {
        console.log('데이터베이스 연결 성공');
        createUserSchema();
        fileSchema = mongoose.Schema({
            fieldname: String,
            originalname: String,
            encoding: String,
            mimetype: String,
            destination: String,
            filename: String,
            path: String,
            size: Number
        });
        pageSchema = mongoose.Schema({
            title: String,
            addr: String,
            developer: [{id:String, name:String}],
            content: String
        });
        fileModel=mongoose.model("files",fileSchema);
        UserModel=mongoose.model("users",UserSchema);
        pageModel= mongoose.model("pages",pageSchema);
    });
    database.on('disconnect',function () {
        setInterval(connectDB,5000);
    });
}
function createUserSchema() {
    UserSchema = mongoose.Schema({
        id: {type:String,required:true, unique:true},
        name: {type:String, index: 'hashed',default:''},
        salt: {type:String,required:true},
        hashed_password:{type:String, require:true, default:''},
        created_at:{type:Date,index:{unique:false},default:Date.now},
        updated_at:{type:Date,index:{unique:false},default:Date.now}
    });

    UserSchema.virtual('password')
        .set(function (password) {
            this._password = password;
            this.salt = this.makeSalt();
            this.hashed_password = this.encryptPassword(password);
        }).get(function () {
        return this._password;
    })
    UserSchema.method('encryptPassword',function (plainText, inSalt) {
        if(inSalt){
            return crypto.createHmac('sha1',inSalt).update(plainText).digest('hex');
        }else{
            return crypto.createHmac('sha1',this.salt).update(plainText).digest('hex');
        }
    });
    UserSchema.method('makeSalt',function () {
        return Math.round((new Date().valueOf()*Math.random())) +'';
    });
    UserSchema.method('authenticate',function (plainText,inSalt, hashed_password) {
        if(inSalt){
            return this.encryptPassword(plainText,inSalt)==hashed_password;
        }else{
            return this.encryptPassword(plainText)==this.hashed_password;
        }
    });
    UserSchema.path('id').validate(function (id) {
        return id.length;
    });
    UserSchema.path('name').validate(function (name) {
        return name.length;
    });
}

app.set('port',3000);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));
app.use('/public',static(path.join(__dirname, 'public')));
app.use('/upload',static(path.join(__dirname, 'upload')));
app.use(cookieParser());
app.use(expressSession({
    secret:'key',
    resave:true,
    cookie:{
        maxAge:1000*60*30///30분까지
    },
    saveUninitialized:true
}));
app.use(cors());
//페이지 정보 DB 등록 함수
var addPage = function(database, title, addr, developer, content, callback){
    console.log('addPage 호출');
    var page = new pageModel({
        "title": title,
        "addr": addr,
        "developer": developer,
        "content": content
        });
    console.log('page 생성');
    page.save(function (err) {
        if(err){
            console.log("에러");
            callback(err, null);
        }
        console.log("페이지데이터 추가");
        callback(null, page);
    });
}
//페이지 정보 DB 등록
app.post('/process/save',function(req,res){
    console.log("page등록");
    console.log(req.body);

    var paramTitle = req.body.title;
    var paramAddr = req.body.addr;
    var paramDeveloper = req.body.developer;
    var paramContents = req.body.content;
    if(database){
        addPage(database,paramTitle,paramAddr,paramDeveloper,paramContents,function(err,result) {
            console.log("콜백 진입");
            if(err){
                console.log('err');
                res.send({});
            }
            if(result){
                console.log("결과");
               //console.dir(result);
                res.send("성공");
            }else{
                console.log('실패');
                res.send({});
            }
        });
    }
})
//logout route
app.post('/process/logout',function(req,res){
    req.session.destroy();
})
//login route
app.post('/process/login',function (req,res) {
    console.log('/process/login  호출됨');
    var paramId =req.param('id');
    var paramPassword = req.param('password');
    if(database){
        authUser(database, paramId,paramPassword,function (err,docs) {
            if(err){
                console.log('err');
                throw err;
            }
            if(docs){
                console.dir(docs);
                var username = docs[0].name;
                req.session.user_id=docs[0].id;/////////////////////////
                res.writeHead('200',{'Content-Type':'text/html;charset=utf8'});
                res.write("<br><br><a href='/public/login.html'>다시 로그인하기</a>");
                res.end();
            }
            else{
                res.writeHead('200',{'Content-Type':'text/html;charset=utf8'});
                res.end();
            }
        })
    }else{

    }
});
//user 추가
app.post('/process/adduser',function (req,res) {
    console.log('/process/adduser 호출');
    var paramId = req.body.id;
    var paramPassword = req.body.password;
    var paramName = req.body.name;
    if(database){
        addUser(database,paramId,paramPassword,paramName,function (err,result) {
            if(err){
                console.log('err');
                throw err;
            }
            if(result){
                console.dir(result);
                res.writeHead('200',{'Content-Type':'text/html;charset=utf8'});
                res.write('<h2>사용자 추가 성공</h2>');
                res.write("<br><br><a href='/public/login.html'>로그인해보기</a>");
                res.end();
            }else{
                res.writeHead('200',{'Content-Type':'text/html;charset=utf8'});
                res.write('<h2>사용자 연결 실패</h2>');
                res.end();
            }
        });
    }
    else{
        res.writeHead('200',{'Content-Type':'text/html;charset=utf8'});
        res.write('<h2>사용자 추가 실패</h2>');
        res.end();
    }
})


var errorHandler = expressErrorHandler({
    static:{
        '404':'./public/404.html'
    }
});
//유저 추가 함수
var addUser =  function(database, id, password, name, callback){
    console.log('addUser 호출');
    var user = new UserModel({"id":id, "password":password, "name":name});
    console.log('user 생성');
    user.save(function (err) {
        if(err){
            console.log("에러");
            callback(err,null);
            return;
        }
        console.log("사용자데이터 추가");
        callback(null, user);
    });
}
var addFile = function(database, fieldname, originalname, encoding, mimetype, destination ,filename, path, size, callback){
    console.log('addFile 호출');
    var file = new fileModel({"fieldname": fieldname,
        "originalname": originalname,
        "encoding": encoding,
        "mimetype": mimetype,
        "destination": destination,
        "filename": filename,
        "path": path,
        "size": size});
    console.log('file 생성');
    file.save(function (err) {
        if(err){
            console.log("에러");
            callback(err,null);
            return;
        }
        console.log("사용자데이터 추가");
        callback(null, file);
    });
}
//사용자 인증
var authUser = function(database,id,password,callback){
    console.log('authUser 호출됨');
    console.log('id:'+id);
    console.log('password:'+password);

    UserModel.find({id: id},function(err,results){
        console.log("bb");
        if(err){
            console.log("find err")
            callback(err,null);
            return;
        }
        console.log(results);
        if(results.length>0){
            console.log("해당 아이디 찾앗다");
            var user = new UserModel({id: id});
            console.log("유저생성");
            var authenticated = user.authenticate(password,results[0]._doc.salt,results[0]._doc.hashed_password);
            console.log("유저인증");
            if(authenticated){
                callback(null,results);
            }else {
                callback(null, null);
            }
        }
        else{
            console.log("일치하는 사용자를 찾지 못함");
            callback(null,null);
        }
    });
}


var storage = multer.diskStorage({
    destination: function (req,file,callback) {
        callback(null,'upload')
    },
    filename: function (req,file, callback) {
        callback(null,file.originalname)
    }
});
var upload = multer({
    storage: storage,
    limits: {
        files: 10,
        fileSize: 1024 * 1024 * 1024
    }
});



app.post('/process/upload',upload.array('uploadFile',1),function (req,res) {
    console.log(req.session);
    if(!req.session.user_id){
        console.log("세션 없다");
        return;
    }
    try{
        console.log(req.files);
        var files = req.files;
        var paramFieldname='';
        var paramOriginalname='';
        var paramEncoding='';
        var paramMimetype='';
        var paramDestination ='';
        var paramFilename ='';
        var paramPath='';
        var paramSize =0;

        if(Array.isArray(files)){
            for(var index=0; index<files.length; index++){
                paramFieldname = files[index].fieldname;
                paramOriginalname = files[index].originalname;
                paramEncoding = files[index].encoding;
                paramMimetype = files[index].mimetype;
                paramDestination = files[index].destination;
                paramFilename = files[index].filename;
                paramPath=files[index].path;
                paramSize = files[index].size;
                if(database){
                    addFile(database,paramFieldname,paramOriginalname,paramEncoding,
                        paramMimetype,paramDestination,paramFilename, paramPath,paramSize,function (err,result) {
                        if(err){
                            console.log('err');
                            throw err;
                        }
                        if(result){
                            console.dir(result);
                        }
                    });
                }
            }
        }else{
            paramOriginalname = files[index].originalname;
            paramFilename = files[index].name;
            paramMimetype = files[index].mimetype;
            paramSize = files[index].size;
        }

        res.writeHead('200',{'Content-Type':'text/html;charset=utf8'});
        res.write('<h3> 파일 업로드 성공 </h3>');
        res.write('<hr/>');
        res.write('<p> 원래파일이름' +  paramOriginalname +'</p>');
        res.write('<p> 저장파일명: '+ paramFilename +'</p>');
        res.write('<p>  파일 타입 ' + paramMimetype +'</p>');
        res.write('<p> 파일 크기' + paramSize +'</p>');
        res.end();

    } catch(err){
        console.dir(err.stack);
    }

});
app.use("/files/:fileName",function (req,res) {
    var fileName = req.params.fileName;
    console.log(fileName);
    fileModel.findOne({filename:fileName},function(err,results){
        if(err){
            res.send({});
        }
        console.dir(results);
        var filePath = 'localhost:3000/upload/'+results.filename;
        console.log(filePath);
        res.send(filePath);
    });
});

app.get('/test',function(req,res){
    console.log("/test 진입");
    var dummy = {
        title: "poty",
        addr: "www.xxxx.co.kr",
        /*developer: "B511084 백경현, B 유현우, B 천성혁",*/
        developer: [{id:"B511084",name:"백경현"}, {id:"B", name:"유현우"}, {id:"B",name:"천성혁"}],
        content: "항상 건강하시고 또 건강하세요"
    };
    console.log(dummy);
    axios({
        url:"http://localhost:3000/process/save",
        method:"post",
        data:dummy
    }).then((e)=>{res.send(e);}).catch((error)=>{res.send("err")});
});
app.use('/pages/:title',function(req,res){
    var title = req.params.title;
    console.log(title);
    pageModel.findOne({title:title},function(err,results){
        if(err){
            res.send({});
        }
        console.dir(results);
        var developerArray=[];
        for(var i=0; i<results.developer.length; i++){
            developerArray.push({id:results.developer[i].id, password:results.developer[i].name});
        }
        var pageData = {
            "title": results.title,
            "addr": results.addr,
            "developer": developerArray,
            "content": results.content
        };
        console.log(pageData);
        res.send(pageData);
    });
})
app.use(expressErrorHandler.httpError(404));
app.use(errorHandler);
app.all('*',function (req,res) {
    res.status(404).send('<h1>ERROR - 페이지를 찾을수 없다</h1>');
});

http.createServer(app).listen(app.get('port'),function () {
   console.log('서버시작');
   connectDB();
});