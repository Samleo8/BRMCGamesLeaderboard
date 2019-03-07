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

const helpMessage =
"This bot controls the live leaderboard for BRMC Camp Games. Most commands are admin only. To activate your admin privileges, type in /setadmin followed by the password given to you.\n\n"+
"/show - Show current scores\n"+
"/setadmin <password> - Makes the current user (i.e. you) admin\n"+
"/update - Update group scores [admin]\n"+
"/newgroup - Create a new group with score 0 [admin]\n"+
"/help - Displays this help message.\n";

let i = 0, j = 0;

const regex_alphanum = new RegExp("[A-Z0-9]","gi");
const regex_non_alphanum = new RegExp("[^A-Z0-9]","gi");
const passwords = ["c9d19f7b00d8cb12425fdcdc3f86717f0736c7b5","1cc695108a8351bd651b0b43f1e9f142d10b0d6d"]; //SHA-1 hashed

//================INITS=================//
init = (ctx)=>{
	ctx.reply(helpMessage);

    retrieveAdminData();
}

bot.start(init);

//================ADMIN STUFF=================//
let admins = {};
/*Array of JSON objects containing:
"id":{
	"name":<name>,
	"level":<level: 0 = master admin, can remove admins and change scores | >0 = normal admin>
}*/

bot.command('setadmin', (ctx)=>{
    ctx.reply("Setting admin rights for "+_getName(ctx)+":");

    let id = ctx.message.from.id;
	let pwd = ctx.state.command.args;

	if(pwd == null || pwd.length == 0){
		ctx.reply("[ERROR] Correct command is: /setadmin <password>");
		return;
	}

    if(ctx.message.from.is_bot){
        ctx.reply("[ERROR] Only humans can access admin rights.");
		return;
    }

	pwd_hashed = sha1_hash(pwd);
    if(getAdminPrivilege(id) == 0) ctx.reply(pwd+" "+pwd_hashed);

	for(i=0;i<passwords.length;i++){
		if(passwords[i]==pwd_hashed){
			return setAdmin(ctx, id, _getName(ctx), i);
		}
	}

    //If it goes to this line, it means all checks failed.
	return ctx.reply("[INFO] Incorrect Password!");
});

//Get ids of admins from admins.json and pass to `admins` array.
retrieveAdminData = (ctx)=>{
    //Check if file exists; if not, create it to prevent problems with access permissions
    if(!fs.existsSync("admin.json")){
        ctx.reply("[DEBUG] admin.json doesn't exist.. creating file..");

        fs.writeFileSync(
            'admin.json',
            JSON.stringify(admins,null,4)
        );

        ctx.reply("[DEBUG] File created!");
        return admins;
    }

    //Retrieve data from leaderboard.json
    return admins = JSON.parse(fs.readFileSync('admin.json', 'utf8'));
}

//Save into admin.json
saveAdmins = (ctx)=>{
    ctx.reply("[DEBUG] Saved admin data: "+JSON.stringify(admins,null,4));

    fs.writeFileSync(
        'admin.json',
        JSON.stringify(admins,null,4)
    );
}

//Check if person is admin
isAdmin = (_id)=>{
    return admins.hasOwnProperty(_id);
}

//Return admin privilege:
/*
    -1 - non-admin
     0 - master admin
    >0 - normal admin
*/
getAdminPrivilege = (_id)=>{
    if(!isAdmin(_id)) return -1;
    return admins[_id].level;
}

//Set admin by details
setAdmin = (ctx, _id, _name, _privilege)=>{
    if( isAdmin(_id) && _privilege!=getAdminPrivilege(_id)){
        //Already admin, no promotion
        return ctx.reply("[ERROR] "+_name+" is already an admin.");
    }

	admins[_id] = {
		"name":_name,
		"level":_privilege
	};

    saveAdmins(ctx);

    return ctx.reply(_name+" is now "+((_privilege)?"an":"a master")+" admin!");
}

//================ACTUAL GAMEPLAY=================//
//Initialise Current Game object
let scores = {};

/*
//Displaying of scores
displayScores = (ctx)=>{
	let scoreboardText = "";
	let scoreboardArr = [];

	//Push all stored info from `Game.leaderboard` into `scoreboardArr`
	for(i in Game.leaderboard){
		if(!Game.leaderboard.hasOwnProperty(i)) continue;

		scoreboardArr.push(Game.leaderboard[i]);
	}

	//Handler for when nobody played but the game is stopped
	if(scoreboardArr.length==0){
		return ctx.reply(
			"⁉️ <b>Everybody's a winner?!?</b> ⁉️\n(\'cos nobody played... 😞)",
			Extra.HTML().markup(
				Markup.keyboard([
					["🏁 Start Game! 🏁"],
					["🕐 Quick Game! 🕐","❓ Help ❓"]
					//,["🛑 Stop Game! 🛑"]
					,["📊 Ranking 📊"]
				])
				.oneTime().resize()
			)
		);
	}

	//Sort the top scorers from `scoreboardArr` in descending order (highest score first)
	scoreboardArr.sort(function(a,b){
		return b.score - a.score;
	});

	//Generate the output text...
	//Also set the global rankings for each user
	for(i=0;i<scoreboardArr.length;i++){
		scoreboardText+="<b>"+parseInt(i+1)+". "+scoreboardArr[i].name+"</b> <i>("+scoreboardArr[i].score+" points)</i>\n";

		//ctx.reply("DEBUG: Updating scoreboard for user "+scoreboardArr[i].id);
		_setRanking(scoreboardArr[i].id, scoreboardArr[i].score, ctx);
	}

	//Show the top scorers with a keyboard to start the game
	return ctx.reply(
		"🏆 <b>Top Scorers</b> 🏆\n"+
		scoreboardText+
		"\n\nView global /ranking | /start a new game",
		Extra.HTML().markup(
			Markup.keyboard([
				["🏁 Start Game! 🏁"],
				["🕐 Quick Game! 🕐","❓ Help ❓"]
				//["🛑 Stop Game! 🛑"]
				,["📊 Ranking 📊"]
			])
			.oneTime().resize()
		)
	);
}
*/
/*
//================LEADERBOARD=================//
_getGlobalRanking = ()=>{
	//Check if file exists; if not, create it to prevent problems with access permissions
	if(!fs.existsSync("leaderboard.json")){
		//ctx.reply("DEBUG: leaderboard.json doesn't exist... creating file..");

		fs.writeFileSync(
			'leaderboard.json',
			JSON.stringify(Game.global_leaderboard,null,2)
		);

		//ctx.reply("DEBUG: File created!");
		return Game.global_leaderboard;
	}

	//Retrieve data from leaderboard.json
	return Game.global_leaderboard = JSON.parse(fs.readFileSync('leaderboard.json', 'utf8'));
}

//--Get ranking of individual user by `user_id`
_getRanking = (user_id, ctx)=>{
	//First retrieve array data from leaderboard.json
	_getGlobalRanking();

	//ctx.reply("DEBUG _getRanking: "+JSON.stringify(Game.global_leaderboard,null,2));
	//ctx.reply\("DEBUG _getRanking id="+user_id);

	if(user_id == null || typeof user_id == "undefined") return;

	//Find the user's data in the array
	let ind = Game.global_leaderboard.findIndex( (item,i)=>{
		return item.id == user_id;
	});

	//ctx.reply\("DEBUG _getRanking ind="+ind);

	if(ind == -1){
		//Data of user doesn't exist:
		//Add it to the leaderboard array
		Game.global_leaderboard.push({
			"id":user_id,
			"name":Game.leaderboard[user_id].name,
			"score":0
		});

		//ctx.reply\("DEBUG: New user: "+Game.global_leaderboard[Game.global_leaderboard.length-1]);

		//Sort and save
		Game.global_leaderboard.sort(function(a,b){
			return b.score-a.score;
		});

		let data = JSON.stringify(Game.global_leaderboard,null,2);

		ctx.reply("Global leaderboard: "+data);

		fs.writeFileSync('leaderboard.json',data);

		ctx.reply("File written for new user "+user_id+", data: "+data);

		//Return new index
		ind = Game.global_leaderboard.findIndex( (item,i)=>{
			return item.id == user_id;
		});

		//ctx.reply\("DEBUG _getRanking: ind = "+ind);
		return ind;
	}
	else{
		//ctx.reply\("DEBUG _getRanking: ind = "+ind);
		return ind;
	}
}

//--Update leaderboard for user `user_id` with score `score`
_setRanking = (user_id, score, ctx)=>{
	if(user_id == null || typeof user_id == "undefined") return;

	let ind = _getRanking(user_id, ctx);

	//Change score
	if(!isNaN(parseInt(score)) && !isNaN(parseInt(ind))){
		Game.global_leaderboard[ind].score += score;
	}

	//Sort and save
	Game.global_leaderboard.sort(function(a,b){
		return b.score-a.score;
	});

	fs.writeFileSync(
		'leaderboard.json',
		JSON.stringify(Game.global_leaderboard,null,2)
	);

	//Return new index
	return Game.global_leaderboard.findIndex( (item,i)=>{
		return item.id == user_id;
	});
}

//--TODO: Set multiple rankings at once to save time on constantly sorting
_setRankingMultiple = (obj)=>{

}

_showRanking = (ctx)=>{
	let ind = _getRanking(ctx.message.from.id, ctx);
		//Note that `Game.global_leaderboard` is already updated in the `_getGlobalRanking()` function embedded in `_getRanking()`

	let leaderboardText = '';
	for(i=0;i<Math.min(Game.global_leaderboard.length,20);i++){
		if(ind == i) leaderboardText += "👉 ";

		switch(i){
			case 0:
				leaderboardText+="🥇 ";
				break;
			case 1:
				leaderboardText+="🥈 ";
				break;
			case 2:
				leaderboardText+="🥉 ";
				break;
			default:
				leaderboardText+="<b>"+parseInt(i+1)+".</b> ";
		}

			leaderboardText+="<b>"+Game.global_leaderboard[i].name+"</b> ";
			//if(ind == i) leaderboardText+="<b>";
				leaderboardText+="<i>("+Game.global_leaderboard[i].score+" points)</i>";
			//if(ind == i) leaderboardText+="</b>";

		if(ind == i) leaderboardText += " 👈";

		leaderboardText += "\n";
	}

	//User is not part of the top 20
	if(ind>=20){
		leaderboardText += "<b>👉 "+Game.global_leaderboard[ind].name+" <i>("+Game.global_leaderboard[ind].score+" points)</i> 👈</b>";
	}

	ctx.reply(
		"🏆 <b>Global Ranking</b> 🏆\n"+
		"<b>----------------------------------</b>\n"+
		leaderboardText,
		Extra.HTML().inReplyTo(ctx.message.message_id)
	);
}

bot.hears('/show_ranking', (ctx)=>{
	if(ctx.message.from.id != 413007985){
		//if it isn't the admin's (mine, Samuel Leong's) telegram ID, return
		_showRanking(ctx);
		return;
	}

	_getGlobalRanking();

	ctx.reply(
		"ADMIN DEBUG! Displaying entire ranking for saving...\n"+
		"==========================\n"+
		JSON.stringify(Game.global_leaderboard,null,2)
	);
});
*/

//================MISC COMMANDS=================//
//Help Command
bot.command('help', (ctx) => {
	ctx.reply(helpMessage);
});
bot.hears("❓ Help ❓", (ctx)=>{
	ctx.reply(helpMessage);
});

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
