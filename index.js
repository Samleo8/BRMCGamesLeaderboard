/*
CREATING BIBLE QUIZZLE TELEGRAM BOT USING telegraf LIBRARY.

REFERENCES:
"- https://thedevs.network/blog/build-a-simple-telegram-bot-with-node-js
"- https://www.sohamkamani.com/blog/2016/09/21/making-a-telegram-bot/
*/

/* CONFIGURATION:
Required Node libraries: telegraf, micro-bot, axios, telegraf-command-parts, fs, crypto
    npm install --save telegraf telegraf-command-parts micro-bot fs crypto axios

Now CLI has been installed with
    npm install -g now

Add the secret API key to Now config
[https://zeit.co/docs/v2/deployments/environment-variables-and-secrets/#securing-environment-variables-using-secrets]:
    now secret add brmcgamesleaderboard-api-key <api-key>

*/


/* RUNNING IN NODE JS:
1) now -e BOT_TOKEN=@brmcgamesleaderboard-api-key --public
2) npm start
(Note that (2) will run (1) as defined in the start script)


*/

//================LIBRARIES AND VARIABLES=================//

//Initialising of Libraries
const { Markup, Extra } = require('micro-bot');
const Telegraf  = require('micro-bot');

const bot = new Telegraf(
    process.env.BOT_TOKEN,
    { username: "brmcgamesleaderboardbot" }
);
bot.use(Telegraf.log());

const fs = require('fs');

const crypto = require('crypto');

sha1_hash = (input)=>{
    return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex');
}

const commandParts = require('telegraf-command-parts');
bot.use(commandParts());

//Help messages
const helpMessage =
"This bot controls the live leaderboard for BRMC Camp Games. Most commands are admin only. To activate your admin privileges, type in /admin followed by the password given to you.\n\n";

const commandsMessage =
"/help - Displays this help message.\n"+
"/admin <password> - Makes the current user (i.e. you) admin of the group whose password has been given to you. DO THIS ONLY IN THE PRIVATE CHAT!\n"+
"/show - Show current scores.\n";

const commandsAdminMessage =
"/update - Update group scores [admin].\n"+
"/newgroup <group name> - Create a new group with score 0 [admin].\n";

const commandsMasterMessage =
"/newleaderboard - Creates a new leaderboard. Command MUST be given in the Telegram group/channel that is is linked to. Generates passcode for that leaderboard to be given to admins [master].\n"+
"/deleteleaderboard - Delete a leaderboard [master].\n";

//Fancy title
const FANCY_TITLE = "🎉 📊 BRMC Games Leaderboard 📊 🎉 \n";

let i = 0, j = 0;

//================DATA HANDLING=================//
const MASTER = 0, NORMAL = 1;

//Use data object for scalability
let data = {
    "admins":{},
    "leaderboards":{},
    "passwords":{  //SHA-1 hashed
        "c9d19f7b00d8cb12425fdcdc3f86717f0736c7b5":{ //Master admin
            "level": MASTER, //master
            "leaderboard":{
                "id": 0, //master
                "name":"all"
            }
        }
    },

    "retrieve":function(dataStr, ctx){
        //Check if file exists; if not, create it to prevent problems with access permissions
        if(!fs.existsSync(dataStr+".json")){
            _log(ctx,dataStr+".json doesn't exist.. creating file..");

            fs.writeFileSync(
                dataStr+".json",
                JSON.stringify(data[dataStr],null,4)
            );

            _log(ctx,"File "+dataStr+".json created!");
            return this[dataStr];
        }

        //Retrieve data from leaderboard.json
        this[dataStr] = JSON.parse(
            fs.readFileSync(dataStr+".json", 'utf8')
        );

        return this[dataStr];
    },
    "retrieveAll":function(ctx){
        this.retrieve("admins",ctx);
        this.retrieve("passwords",ctx);
        this.retrieve("leaderboards",ctx);
    },

    "save":function(dataStr, ctx){
        fs.writeFileSync(
            dataStr+".json",
            JSON.stringify(this[dataStr],null,4)
        );

        //_log(ctx,"Saved "+dataStr+" data: "+JSON.stringify(this[dataStr],null,4));
    },
    "saveAll":function(ctx){
        this.save("admins",ctx);
        this.save("passwords",ctx);
        this.save("leaderboards",ctx);
    }
};

//================INITS=================//
init = (ctx)=>{
    data.retrieveAll(ctx);

	_helpMessageDisplay(ctx);
}

bot.command('start', (ctx)=>{ init(ctx); } );

//================ADMIN HANDLING=================//
/*Array of JSON objects containing:
"id":{
	"name":<name>,
	"level":<level: 0 = master admin, can remove admins and change scores | >0 = normal admin>
}*/

bot.command('admin', (ctx)=>{
    let id = ctx.message.from.id;
	let pwd = ctx.state.command.args;

	if(pwd == null || pwd.length == 0){
		return ctx.reply(
			"[ERROR] Correct command is: /admin <password>",
			Extra.inReplyTo(ctx.message.message_id)
		);
	}

    if(ctx.message.from.is_bot){
        return ctx.reply(
			"[ERROR] Only humans can access admin rights.",
			Extra.inReplyTo(ctx.message.message_id)
		);
    }

    //Retrieve data in case
    data.retrieveAll(ctx);

    //Hash password and compare to see if valid
	let pwd_hashed = sha1_hash(pwd);
    _log(ctx,pwd+" "+pwd_hashed);

	if(data.passwords.hasOwnProperty(pwd_hashed)){
		setAdmin(ctx, id, _getName(ctx), pwd_hashed);

		//Show the help message
		let _helpMsg = commandsAdminMessage+((getAdminPrivilege(id)==MASTER)?commandsMasterMessage:"");
		ctx.reply(_helpMsg);
		return;
	}
    else
		return ctx.reply(
			"[INFO] Incorrect Password!",
			Extra.inReplyTo(ctx.message.message_id)
		);
});

//Check if person is admin
isAdmin = (_id)=>{
    return data.admins.hasOwnProperty(_id);
}

//Return admin privilege:
/*
    -1 - non-admin
     0 - master admin
    >0 - normal admin
*/
getAdminPrivilege = (_id)=>{
    if(!isAdmin(_id)) return -1;
    return data.admins[_id].level;
}

//Return group obj that the admin is in charge of:
/*
    -1 - non-admin
	0 - master admin
*/
getAdminLeaderboard = (_id)=>{
	let priv = getAdminPrivilege(_id);

    if(priv == -1 || priv == 0) return priv;

	return data.admins[_id].leaderboard;
}

//Set admin by details
setAdmin = (ctx, _id, _name, _hashedPassword)=>{
    //ctx.reply("Setting admin rights for "+_name+":");

    let _privilege = data.passwords[_hashedPassword].level;

	/* //Disable promotion check for debugging
    if( isAdmin(_id) && _privilege>getAdminPrivilege(_id)){
        //Already admin, no promotion
        return ctx.reply("[ERROR] "+_name+" is already a master admin.");
    }
	//*/

    if(_privilege == MASTER){
        ctx.reply(_name+" is now "+((_privilege>=getAdminPrivilege(_id))?"promoted to ":" ")+"a master admin!\n");
    }
    else{
        let groupName = data.passwords[_hashedPassword].leaderboard.name;
        ctx.reply(_name+" is now an admin for group "+groupName+"!\n\n"+commandsAdminMessage);
    }

	data.admins[_id] = {
		"name":_name,
		"level":_privilege,
        "password":_hashedPassword,
		"leaderboard": data.passwords[_hashedPassword].leaderboard
	};

    data.save("admins",ctx);
}

//================LEADERBOARD SETUP=================//
/* Master admin sets up leaderboard:
    name, group to send to, password
*/
_generatePassword = (_len)=>{
    const charset = "abcdefghijklmnopqstuvwxyzABCDEFGHIJKLMNOPQSTUVWXYZ0123456789";

    if(_len == null || _len == undefined || typeof len == "undefined" || isNaN(_len) || _len < 8) _len = 8;

    let pwd = [], pwd_ok = false, pwd_hashed;

    while(!pwd_ok){
        for(i=0;i<1000;i++){ //try max 1000 times
            for(var i=0;i<_len;i++){
                var _rand = getRandomInt(0,charset.length-1);
                pwd.push(charset[_rand]);
            }

            pwd = pwd.join("");
            pwd_hashed = sha1_hash(pwd);

            if( !data.passwords.hasOwnProperty(pwd_hashed) ){ //check if password is unique
                pwd_ok = true;
                break;
            }
        }
        _len++; //if it doesnt work try adding to the length and try again
    }

    return {"raw":pwd, "hashed":pwd_hashed};
}

//Initialise Current Game object
let scores = {};

//Must be added from group
bot.command("newleaderboard", (ctx)=>{
    let _id = ctx.message.from.id;

    if(ctx.chat.type=="private"){
        return ctx.reply(
			"[ERROR] You need to add a new leaderboard in a GROUP/CHANNEL!",
			Extra.inReplyTo(ctx.message.message_id)
		);
    }

    data.retrieveAll(ctx); //retrieve here because bot might not have retrieved data (rmb we are in private chat) yet.

    if(getAdminPrivilege(_id)!=MASTER){
        return ctx.reply(
			"[ERROR] You need to be a master admin to add a new leaderboard!",
			Extra.inReplyTo(ctx.message.message_id)
		);
    }

    if( data.leaderboards.hasOwnProperty(ctx.chat.id) ){
        return ctx.reply(
			"[ERROR] Leaderboard has already been linked to this group. /deleteleaderboard first.",
			Extra.inReplyTo(ctx.message.message_id)
		);
    }

    //Generate password for this particular leaderboard/Telegram group
    _pwdObj = _generatePassword(10);

    _log(ctx,JSON.stringify(ctx.chat));

    //Add to the leaderboards
    data.leaderboards[ctx.chat.id] = {
        "password": _pwdObj.hashed,
        "groups":[] //array of group objects { name, points }
    }

    //Add to the password objects
    data.passwords[_pwdObj.hashed] = {
        "level":NORMAL, //admin
        "leaderboard":{
            "id": ctx.chat.id, //telegram group id [note: negative number]
            "name":ctx.chat.title //telegram group name
        }
    }

    //Send private message to user
    ctx.telegram.sendMessage(
        ctx.message.from.id,
        FANCY_TITLE+
        "The password for the group "+ctx.chat.username+" is:\n"+
        _pwdObj.raw+"\n\n"+
        "Remember to tell your admins to send /admin "+_pwdObj.raw+" in the private @brmcgamesleaderboardbot chat to activate their admin privileges for this group."
    );

    ctx.telegram.sendMessage(
        ctx.message.from.id,
        "/admin "+_pwdObj.raw
    );

	data.saveAll(ctx);

	//Inform user that a leaderboard has been created
	ctx.reply("[INFO] Leaderboard generated and linked to this Telegram "+ctx.chat.type+". @brmcgamesleaderboardbot has sent you the admin password in its private chat. Remember to forward it to your admins!");
});

//================LEADERBOARD GROUP HANDLING=================//
bot.command("show", (ctx)=>{

});

newGroup = (ctx, name, user_id)=>{
	//TODO: Make object with index by name
	let leaderboard = data.admins[user_id].leaderboard;
	let hashed_name = sha1_hash(name); //avoid problems with spaces and other random characters

	let grpArr = data.leaderboards[leaderboard.id].groups;

	if(grpArr.hasOwnProperty(hashed_name)){
		ctx.reply(
			"[ERROR] Group with this name has already been added. To delete the group or update scores, use /deletegroup or /update",
			Extra.inReplyTo(ctx.message.message_id)
		);
	}
	else{
		grpArr[hashed_name] = {
			"leaderboard":leaderboard.id,
			"name":name,
			"hashed_name":hashed_name,
			"score":0
		};
	}

	ctx.reply(
		"[INFO] Group "+name+" has been added to the leaderboard linked to Telegram Group \""+leaderboard.name+"\"",
		Extra.inReplyTo(ctx.message.message_id)
	);

	data.saveAll();
}

bot.command("newgroup", (ctx)=>{
	//TODO: Support for multiple groups
	grpName = ctx.state.command.args;

	if(grpName == null || grpName == undefined || grpName.length<=0){
		return ctx.reply(
			"[ERROR] Please enter a group name",
			Extra.inReplyTo(ctx.message.message_id)
		);
	}

	//Retrive data first
	data.retrieveAll(ctx);

	let id = ctx.message.from.id;
	let priv = getAdminPrivilege(id);

	if(priv == MASTER){
		ctx.reply("As a master admin, you have access to all leaderboards.");
		//TODO: allow to master admin to modify leaderboard
		ctx.reply("Sorry I can\'t tell which leaderboard you want to add the group to");
		return;
	}
	else if(priv == -1){ //not admin
		ctx.reply(
			"Only admins can add groups! Activate your admin privileges using /admin <password>",
			Extra.inReplyTo(ctx.message.message_id)
		);
		return;
	}

	newGroup(ctx, grpName, id);
});

bot.command("newgroups", (ctx)=>{

})

//================MISC COMMANDS=================//
//Help Command
bot.command('help', (ctx) => {
	_helpMessageDisplay(ctx);
});
bot.hears("❓ Help ❓", (ctx)=>{
	_helpMessageDisplay(ctx);
});

//Help Message
_helpMessageDisplay = (ctx)=>{
	data.retrieve("admin", ctx);

	let priv = getAdminPrivilege(ctx.message.from.id);

    let msg = helpMessage;
    msg+= commandsMessage+"\n"
		 +commandsAdminMessage+"\n";

    if(priv == MASTER){
        msg+=commandsMasterMessage+"\n";
    }

	msg+="\n[ADMIN STATUS]: ";
	switch(priv){
		case -1:
			msg+="None";
			break;
		case MASTER:
			msg+="Master";
			break;
		case NORMAL:
			msg+="Admin (Telegram Group \""+getAdminLeaderboard(ctx.message.from.id).name+"\")";
			break;
	}

    return ctx.reply(msg);
}

//Display debug messages
_log = (ctx, msg)=>{
    //console.log("[DEBUG] "+msg);
    if(getAdminPrivilege(ctx.message.from.id)==MASTER) ctx.reply("[DEBUG] "+msg);
}

//Get user's name from ctx
_getName = (ctx)=>{
    let username = ctx.message.from.username.toString();
	let first_name = ctx.message.from.first_name.toString();
	let last_name = ctx.message.from.last_name.toString();

	if(first_name && last_name) return first_name+" "+last_name;
    if(!first_name && !last_name) return username;
	if(first_name) return first_name;

    return last_name;
}

//================BOT HEARS==================//
//Needs to be here because otherwise all the other commands won't run


//================EXPORT BOT=================//
module.exports = bot;

//================MISC. FUNCTIONS=================//
//Get random integer: [min,max]
getRandomInt = (min, max)=>{
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//Get random float: [min,max)
getRandomFloatExcl = (min, max)=>{
    return Math.random() * (max - min) + min;
}

//Remove duplicates in array
removeDuplicates = (_array)=>{
	let _i, arr = [];
	let found = false;
	for(_i=0;_i<_array.length;_i++){
		found = false;
		for(_j=0;_j<arr.length;_j++){
			if(_array[_i] == arr[_j] || ( JSON.stringify(_array[_i]) == JSON.stringify(arr[_j]) && typeof _array[_i] == typeof arr[_j]) ){
				found=true;
				break;
			}
		}
		if(!found) arr.push(_array[_i]);
	}

	return arr;
}

String.prototype.toTitleCase = function() {
  var i, j, str, lowers, uppers;
  str = this.replace(/([^\W_]+[^\s-]*) */g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });

  // Certain minor words should be left lowercase unless
  // they are the first or last words in the string
  lowers = ['A', 'An', 'The', 'And', 'But', 'Or', 'For', 'Nor', 'As', 'At',
  'By', 'For', 'From', 'In', 'Into', 'Near', 'Of', 'On', 'Onto', 'To', 'With'];
  for (i = 0, j = lowers.length; i < j; i++)
    str = str.replace(new RegExp('\\s' + lowers[i] + '\\s', 'g'),
      function(txt) {
        return txt.toLowerCase();
      });

  // Certain words such as initialisms or acronyms should be left uppercase
  uppers = ['Id', 'Tv'];
  for (i = 0, j = uppers.length; i < j; i++)
    str = str.replace(new RegExp('\\b' + uppers[i] + '\\b', 'g'),
      uppers[i].toUpperCase());

  return str;
}
