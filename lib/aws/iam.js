const AWS = require('aws-sdk');

AWS.config.update({
    retryDelayOptions: {
        base: 500,
        retryCount: 10
    }
});

const iam = new AWS.IAM({
    apiVersion: '2010-05-08'
});

// Get current IAM user
const getCurrentIamUser = async () => {
    try{
        return await (await iam.getUser().promise()).User.UserName;
    }catch(err){
        throw err;
    }
}

module.exports = {
    getCurrentIamUser
}