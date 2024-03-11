const express = require('express');
const multer = require('multer');
const data = require('./store');
const path = require('path');
const AWS = require('aws-sdk');
const { log } = require('console');
require('dotenv').config();

process.env.AWS_SDk_JS_SUPPRESS_MAITENANCE_MODE_MESSAGE = '1';

AWS.config.update({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    region: process.env.REGION
});
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYANMODB_TABLE;

const PORT = 3000;
const app = express();

const storage = multer.memoryStorage({
    destination: function (req, file, cb) {
        // cb(null, './public/uploads');
        cb(null, '');
    }
    // filename: function (req, file, cb) {
    //     cb(null, Date.now() + path.extname(file.originalname));
    // }
});

// const upload = multer({ storage: storage });
const upload = multer({ storage,
    limits: { fileSize: 20000000 },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

app.use(express.json({ extended: false }));
app.use(express.static('./views'));
app.use(express.static(path.join(__dirname, 'public')));


app.set('view engine', 'ejs');
app.set('views', './views');
app.set('public', './public');
app.set('uploads', './uploads');


// app.get('/', (req, res) => {
//     const courses = data;
//     return res.render('index', { courses });
// });
app.get("/", async(req, res) => {
    try {
        const params = {TableName : tableName}
        const courses =await dynamodb.scan(params).promise();

        // console.log(courses);
        return res.render("index", {courses: courses.Items})
    } catch (error) {
        console.log("Error", error);
        return res.status(500).json({"Iteration failed": error});
    }
})

app.post("/save", upload.single("img"), async(req, res) => {
    try {
        const id = req.body.id;
        console.log(id);
        const name = req.body.name;
        console.log(name);
        const image = req.file?.originalname.split(".")
        console.log(image);
        const fileType = image[image.length - 1];
        console.log(fileType);
        const filePath = `${id}_${Date.now().toString()}.${fileType}`;
        console.log(filePath);

        const paramS3 = {
            Bucket : bucketName,
            Key : filePath,
            Body : req.file.buffer,
            ContentType : req.file.mimetype,
        };

        s3.upload(paramS3, async(error, data) => {
            if(error){
                console.log("Error", error);
                return res.status(500).json({"Upload failed": error});
            }else{
                const imageURL = data.Location;
                const paramDynamoDb = {
                    TableName : tableName,
                    Item : {
                        id  : id,
                        name : name,
                        img : imageURL,
                    },
                };

                await dynamodb.put(paramDynamoDb).promise();
                return res.redirect("/");
             }
            });
    } catch (error) {
        console.log("Error", error);
        return res.status(500).json({"Iteration failed": error});
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// app.post('/', upload.single('img'), (req, res) => {
//     const { id, name } = req.body; 
//     const img = req.file.filename;
//     data.push({ id, name, img: "/uploads/" + img });
//     // console.log(data);
//     return res.redirect('/');
// });

app.post("/delete",upload.fields([]),(req,res)=>{
    const listCheckbox = Object.keys(req.body);
    if(!listCheckbox || listCheckbox.length<=0){
        return res.redirect("/");
    }
    try {
        function onDeleteItem(length){
            const params = {
                TableName: tableName,
                Key: {
                    id: listCheckbox[length]
                }
            };
            dynamodb.delete(params, (err, data) => {
                if(err){
                    console.log(err);
                    return res.send("Internal Server Error");
                }else if(length>0) onDeleteItem(length-1);
                else {
                    return res.redirect("/");
                }
            });
        }
        onDeleteItem(listCheckbox.length-1);
    } catch (error) {
        console.error("error",error);
        return res.status(500).send({ error: error.message });
    }
})

