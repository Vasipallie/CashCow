//inits
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import { time } from 'console';
import dotenv from 'dotenv';

dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cookieParser());
const supalink = process.env.SUPALINK ;
const supakey = process.env.SUPAKEY ;


// Supabase setup
//WARNING - DO NOT PUBLISH Api Keys VIA GITHUB OR ANY PUBLIC REPOSITORY
const supabase = createClient(supalink, supakey); 

// Middleware data stuff, important for app to run
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'views')));
app.use(bodyParser.urlencoded({ extended: true }));

//Middleware to check if user is logged in -DONE
function checkAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/');

  supabase.auth.getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) return res.redirect('/');
      next();
    })
    .catch(() => res.redirect('/'));
}

// root page -DONE
app.get('/', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');

  supabase.auth.getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) return res.redirect('/login');
      res.redirect('/home');
    })
    .catch(() => res.redirect('/login'));
});
// Login -DONE
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    const loginemail = req.body.loginemail;
    const loginpassword = req.body.loginpassword;

  supabase.auth.signInWithPassword({
    email: loginemail,
    password: loginpassword
  }).then(({ data, error }) => {
    if (error || !data?.session) {
      return res.render('login', { title: 'Login', error: 'Invalid credentials.' });
    }

    const token = data.session.access_token;
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
      //Cookie is set to 3 days because I highly doubt anyone will use this app for more than 3 days at a time.
    });
    res.redirect('/home');
  });
});


// Signup -DONE
//CHECK THIS BEFORE PRODUCTION
//only for admins so they kinda need to check the database to config user's company
app.get('/signup', (req, res) => res.render('signup'));
app.post('/signup', (req, res) => {  
  const { loginemail, loginpassword } = req.body;

  supabase.auth.signUp({
    email: loginemail,
    password: loginpassword
  }).then(({ data, error }) => {
    if (error) {
      return res.render('signup', {error: 'Signup failed. Try again.' });
    }
    supabase.auth.signInWithPassword({
    email: loginemail,
    password: loginpassword
  }).then(({ data, error }) => {
    if (error || !data?.session) {
      return res.render('signup', {error: 'Invalid credentials.' });
    }
    const token = data.session.access_token;
    res.cookie('token', token, {
      httpOnly: true,
      maxAge:  60 * 60 * 1000, // 1 hr
      //Cookie is set to 1 hr as this is for administration purposes only.
    });
    //get user id
    const userId = data.session.user.id;
    console.log('User ID:', userId);
    supabase.from('Companies').insert([{user_id: userId,email:loginemail,company:'NULL',Cash: 10000000,Metal: 0,Plastic: 0,Wood: 0,Electricity: 0}
    ]).then(({ data, error }) => {
      if (error) {
        console.error('Error initializing user:', error);
        res.render('signup', {error: 'Signup failed erorinit. Try again.' });
      }
      console.log('User initialized successfully:', data);
      res.redirect('/home');      
    });
  });
  });
});


// Home (protected) -DONE
//CHECK THIS BEFORE PRODUCTION
app.get('/home',checkAuth, async(req, res) => {
  const token = req.cookies.token;
  const uuid= supabase.auth.getUser(token)
  const uuidi =(await uuid).data.user.id;
  let { data: Companies, error } = await supabase
    .from('Companies')
    .select('company, Cash, Metal, Plastic, Wood, Electricity')
    .eq('user_id', uuidi);
  if (error) {
    console.error('Error fetching companies:', error);
    return res.status(500).send('Error fetching companies');
  }
  const FormattedCash = Companies[0].Cash.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  res.render('home', {
    company: Companies[0].company,
    Cash: FormattedCash, 
    Metal: Companies[0].Metal,
    Plastic: Companies[0].Plastic,
    Wood: Companies[0].Wood,
    Electricity: Companies[0].Electricity
  });
    console.log(Companies);

});


// DigiToken page -DONE
// only checks and displays the OTP for the user 
// CHECK THIS BEFORE PRODUCTION
app.get('/digitoken', checkAuth,async(req, res) => {
  //dont touch pls, kinda important
  //gets the OTP for the user by token and displays it in 4 blocks
  //get user id from cookie
  if (!req.cookies.token) return res.redirect('/login');
  const token = req.cookies.token;
  //get user id from supabase
  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.user) {
    return res.status(401).send('Unauthorized');
  }
  const userId = user.user.id;
  console.log('User ID:', userId);
let { data: Companies, error } = await supabase
    .from('Companies')
    .select('OTP, OTPexpire')
    .eq('user_id', userId)
    .single();
    console.log(Companies);
  
  const otp = Companies.OTP.toString().padStart(4 , '0' ); // Ensure it's 4 digits
  const block1 = otp.charAt(0);
  const block2 = otp.charAt(1);
  const block3 = otp.charAt(2);
  const block4 = otp.charAt(3);
  // Get expiry date
  const expiryDate = new Date(Companies.OTPexpire);
 res.render('digitoken', {userid:userId,supakey:supakey,supalink:supalink,block1:block1,block2:block2,block3:block3,block4:block4,expiry: expiryDate
});
});
 

//Patent Library -DONE
// CHECK THIS BEFORE PRODUCTION
app.get('/patentlib', checkAuth, async (req, res) => {
  // Fetch patents from the database and show them 
let { data: patents, error } = await supabase
    .from('Patents')//returns patents with the approved flag set to true
    .select('PatentName, Owner, Submitted, link')
    .eq('Approval', true) 
    console.log(patents);
  if (error) {
    console.error('Error fetching patents:', error);
    return res.status(500).send('Error fetching patents');
  }
  if (patents.length === 0) {
    return res.render('patent', { patents: '<p>No patents available</p>' });
  }
  // Render the patents in the view
  let patentList = '';
  patents.forEach(patent => {
    patentList += `
      <div class="patent-holder"> 
        <p class="h3">${patent.PatentName}</p>
        <hr>
        <p>Owner: ${patent.Owner}</p>
        <p>Submitted on: ${new Date(patent.Submitted).toLocaleString()}</p>
        <button class="view" onclick="window.location.href='${patent.link}'">View Patent</button>
      </div>`;
  });
  console.log(patentList);
  res.render('patent', { patents: patentList});

});
// Patent submission form -DONE
app.get('/patentsubmit', checkAuth, (req, res) => {
  res.render('patentform');
});
app.post('/patentsubmit', checkAuth, async (req, res) => {
  const { patentname, Patentlink } = req.body;
  const token = req.cookies.token;
  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.user) {
    return res.status(401).send('Unauthorized');
  }
  const userId = user.user.id;
  const { data: Companies, error: companyError } = await supabase
    .from('Companies')
    .select('company')
    .eq('user_id', userId)
    .single();
  if (companyError || !Companies) {
    console.error('Error fetching company:', companyError);
    return res.status(500).send('Error fetching company');
  }
  // Insert the patent into the database
  const { error: insertError } = await supabase
    .from('Patents')
    .insert({
      PatentName: patentname,
      Owner: Companies.company,
      link: Patentlink,
      Approval: false,
    });
  if (insertError) {
    console.error('Error inserting patent:', insertError);
    return res.status(500).send('Error submitting patent');
  }
  console.log(`Patent submitted by ${Companies.company}: ${patentname}`);
  res.redirect('/patentlib');
});


// Business Deals page -DONE
// To submit a business deal
app.get('/businessdeals', checkAuth, (req, res) => {
  //get company name and email from supabase
  const token = req.cookies.token;
  supabase.auth.getUser(token).then(({ data, error }) => {
    if (error || !data?.user) {
      return res.status(401).send('Unauthorized');
    }
    const userId = data.user.id;
    supabase
      .from('Companies')
      .select('company, email')
      .eq('user_id', userId)
      .single()
      .then(({ data: companyData, error: companyError }) => {
        if (companyError || !companyData) {
          console.error('Error fetching company:', companyError);
          return res.status(500).send('Error fetching company');
        }
        res.render('businessdeals', {
          companyemail: companyData.email,
          companyname: companyData.company,
        });
      });
  });
});
app.post('/businessdeals', checkAuth, async (req, res) => {
  const{ externalemails, dealconditions} = req.body;
  const token = req.cookies.token;
  console.log(externalemails, dealconditions);
  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.user) {
    return res.status(401).send('Unauthorized');
  }
  const extralis= '{' + externalemails + '}';
  const userId = user.user.id;
  const timestam = new Date().toISOString();
  const { error: insertError } = await supabase
    .from('Deals')
    .insert([{
      Owner: userId,
      Emails: extralis,
      DealLink: dealconditions,
      submissiontime: timestam
    }]);
  if (insertError) {
    console.error('Error inserting business deal:', insertError);
    return res.status(500).send('Error submitting business deal');
  }
  //get deal id
  const { data: dealData, error: dealError } = await supabase
    .from('Deals')
    .select('dealid')
    .eq('Owner', userId)
    .eq('submissiontime', timestam)
    .single();
  if (dealError || !dealData) {
    console.error('Error fetching deal ID:', dealError);
    return res.status(500).send('Error fetching deal ID');
  }
  console.log(`Business deal submitted by ${userId}: ${dealData.dealid}`);
  res.redirect('/OTPverif'+ '/' + dealData.dealid);
}); 
//OTP Verification page -DONE
app.get('/OTPverif/:id', checkAuth, (req, res) => { const dealId = req.params.id;
  supabase.from('Deals').select('Emails').eq('dealid', dealId).single().then(({ data, error }) => {
    console.log(data);
    if (error) {
      console.error('Error fetching deal emails:', error);
      return res.status(500).send('Error fetching deal emails');
    }
    const emails = data.Emails;
    const emailInputs = emails.map(email => {
      return `<div class="form-group">
                <label for="otp-${email}">Enter OTP for ${email}</label>
                <input type="text" id="otp-${email}" name="otp-${email}" required maxlength="4">
              </div>`;
    }).join('');
    res.render('OTPverif', {Verifycode: emailInputs,dealid:req.params.id})
});
});
app.post('/OTPverif', checkAuth, async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).send('Unauthorized');

  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.user) return res.status(401).send('Unauthorized');

  const dealId = req.body.dealid;

  // Get the emails for this deal
  const { data: dealData, error: dealError } = await supabase
    .from('Deals')
    .select('Emails')
    .eq('dealid', dealId)
    .single();

  if (dealError || !dealData) {
    console.error('Error fetching deal:', dealError);
    return res.status(500).send('Error fetching deal');
  }
  const emails = dealData.Emails.map(email => email.trim());

  let allValid = true;
  let failedEmail = null;

  for (let email of emails) {
    const enteredOtp = req.body[`otp-${email}`];

    if (!enteredOtp || enteredOtp.length !== 4 || isNaN(enteredOtp)) {
      allValid = false;
      failedEmail = email;
      break;
    }
    const { data: companyData, error: companyError } = await supabase
      .from('Companies')
      .select('OTP')
      .eq('email', email)
      .single();

      console.log(companyData);
    if (companyError || !companyData) {
      console.error(`Error fetching OTP for ${email}:`, companyError);
      allValid = false;
      failedEmail = email;
      break;
    }
    if (companyData.OTP !== enteredOtp) {
      allValid = false;
      failedEmail = email;
      break;
    }
    console.log(companyData.OTP,'  ', enteredOtp);
    if (companyData.OTP === enteredOtp) {
      console.log(`OTP for ${email} is valid.`);

    }
  }

  if (allValid) {
    const { error: updateError } = await supabase
      .from('Deals')
      .update({ otpverfied: true })
      .eq('dealid', dealId);

    if (updateError) {
      console.error('Failed to update deal as verified:', updateError);
      return res.status(500).send('Could not verify deal');
    }

    return res.redirect(`/Deals/${dealId}`);
  } else {
    console.warn(`OTP verification failed for email: ${failedEmail}`);
    return res.status(400).send(`OTP verification failed for ${failedEmail}.`);
  }
});
// Check Status of Deals -DONE
app.get('/Deals/:id', checkAuth, async (req, res) => {
  const dealId = req.params.id;
  const { data: dealData, error: dealError } = await supabase
    .from('Deals')
    .select('Owner, Emails, DealLink, submissiontime, otpverfied,Reject,Approved')
    .eq('dealid', dealId)
    .single();
  if (dealError || !dealData) {
    console.error('Error fetching deal:', dealError);
    return res.status(500).send('Error fetching deal');
  }
  // Prepare the deal details for rendering
  //show it in a pretty way
  const dealDetails = {
    dealId: dealId,
    dealLink: dealData.DealLink,
    submissionTime: new Date(dealData.submissiontime).toLocaleString( 'EN-IN', {
      timeZone: 'Asia/Singapore'} ),
    otpVerified: dealData.otpverfied,
    reject: dealData.Reject,
    approved: dealData.Approved,

  };
  console.log(dealDetails);
  const dealid = dealDetails.dealId;
  const dealLink = dealDetails.dealLink;
  const submissionTime = new Date(dealData.submissiontime).toLocaleString( 'EN-IN', {timeZone: 'Asia/Singapore'} )
  const otpVerified = dealData.otpverfied;
  if (dealData.Reject === true) {
    console.log(`Deal ${dealId} has been rejected.`);
     const reject = 'Deal has been rejected.';
      res.render('dealdetails', {
      deal: dealDetails,
      dealid: dealid,
      dealLink: dealLink,
      submissionTime: submissionTime,
      otpVerified: otpVerified,
      reject: reject
  });
  }else if (dealData.Approved === true) {
    console.log(`Deal ${dealId} is approved.`);
    const reject = 'Deal has been approved.';
    res.render('dealdetails', {
      deal: dealDetails,
      dealid: dealid,
      dealLink: dealLink,
      submissionTime: submissionTime,
      otpVerified: otpVerified,
      reject: reject
    });
  } else {
    console.log(`Deal ${dealId} is still pending.`);
    const reject = 'Deal is awaiting manual review.';
    res.render('dealdetails', {
      deal: dealDetails,
      dealid: dealid,
      dealLink: dealLink,
      submissionTime: submissionTime,
      otpVerified: otpVerified,
      reject: reject
    });
  }
});


// Auction Portal
// Helps place bid on auctions and create new auctions
app.get('/auction',checkAuth, async (req, res) => {
  // Fetch auctions from the database and show current bid 
  const { data: auctions, error } = await supabase
    .from('Auctions')
    .select('*')
    .eq('Available', true); 
  if (error) {
    console.error('Error fetching auctions:', error);
    return res.status(500).send('Error fetching auctions');
  }
  if (auctions.length === 0) {
    return res.render('auction', { auctions: '<p class="h4">No auctions available</p>' });
  }
  // Render the auctions in the view
  let auctionList = '';
  for (const auction of auctions) {
    const currentBid = auction.Bids ? Object.values(auction.Bids).reduce((max, bid) => Math.max(max, bid.bid), 0) : 0;
    const highestBidder = auction.Bids ? Object.values(auction.Bids).find(bid => bid.bid === currentBid)?.bidder : 'No bids yet';
    //get owner name from Companies table
    const { data: companyData, error: companyError } = await supabase
    .from('Companies')
    .select('company')
    .eq('user_id', auction.Owner)
    .single();
    if (companyError || !companyData) {
      console.error('Error fetching company:', companyError);
      return res.status(500).send('Error fetching company');
    }
    auction.Owner = companyData.company;
    auctionList += `
      <div class="patent-holder">
                <img src="resources/background.jpg" class="img" alt="Resource Image" />
                <span class="h4 headin">${auction.Item}</span>
                <span class="subtext">Qty: ${auction.Qty}</span>
                <span class="subtext">Owner: ${auction.Owner}</span>
                <span class="subtext" id="${auction.id}">Current Bid: $ ${currentBid} </span>
                <span class="subtext">End Time: ${auction.Timeout}</span>
                <button class="view" onclick="window.location.href = '/auction/${auction.id}';">Bid</button>
            </div>`;
  }
  res.render('auction', { auctions: auctionList, supalink:supalink,supakey:supakey });
});
app.get('/auction/:id', checkAuth, async (req, res) => {
  const auctionId = req.params.id;
  const { data: auction, error } = await supabase
    .from('Auctions')
    .select('*')
    .eq('id', auctionId)
    .single();
  if (error || !auction) {
    console.error('Error fetching auction:', error);
    return res.status(404).send('Auction not found');
  }
  // Get the current highest bid
  const currentBid = auction.Bids ? Object.values(auction.Bids).reduce((max, bid) => Math.max(max, bid.bid), 0) : 0;
  // Get the highest bidder
  const highestBidder = auction.Bids ? Object.values(auction.Bids).find(bid => bid.bid === currentBid)?.bidder : 'No bids yet';
  // Render the auction bid page
  const title = `${auction.Qty} ${auction.Item} Tokens`;
  //get owner name from Companies table
  const { data: companyData, error: companyError } = await supabase
    .from('Companies')
    .select('company') 
    .eq('user_id', auction.Owner)
    .single();
  if (companyError || !companyData) {
    console.error('Error fetching company:', companyError);
    return res.status(500).send('Error fetching company');
  }
  res.render('auctionbid', {
    auctionid: auctionId,
    title: title,
    owner: companyData.company,
    currentBid: currentBid,
    highestBidder: highestBidder,
    time: new Date(auction.Timeout).toLocaleString('en-US', { timeZone: 'Asia/Singapore' }),
    supalink: supalink,
    supakey: supakey
  });
});
app.post('/placebid', checkAuth, async (req, res) => {
  const auctionId = req.body.auctionId;
  console.log(auctionId);
  const bidAmount = parseFloat(req.body.bidAmount);
  console.log(bidAmount);
  if (isNaN(bidAmount) || bidAmount <= 0) {
    return res.status(400).send('Invalid bid amount');
  }
  const token = req.cookies.token;
  if (!token) return res.status(401).send('Unauthorized');
  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.user) return res.status(401).send('Unauthorized');
  const userId = user.user.id;
  console.log('User ID:', userId);
  // compare bid amount with current highest bid
  const { data: auction, error: auctionError } = await supabase
    .from('Auctions')
    .select('*')
    .eq('id', auctionId)
    .single();
  if (auctionError || !auction) {
    console.error('Error fetching auction:', auctionError);
    return res.status(404).send('Auction not found');
  }
  const currentBid = auction.Bids ? Object.values(auction.Bids).reduce((max, bid) => Math.max(max, bid.bid), 0) : 0;
  if (bidAmount <= currentBid) {
    return res.status(400).send('Bid amount must be higher than the current bid');
  }
  // Check if the user has enough funds
  const { data: company, error: companyError } = await supabase
    .from('Companies')
    .select('Cash')
    .eq('user_id', userId)
    .single();
  if (companyError || !company) {
    console.error('Error fetching company:', companyError);
    return res.status(500).send('Error fetching company');
  }
  if (company.Cash < bidAmount) {
    return res.status(400).send('Insufficient funds to place this bid');
  }
  // Place the bid
  const newBid = {
    bidder: userId,
    bid: bidAmount,
  };
  //append to bids json field
  const { data: updatedAuction, error: updateError } = await supabase
    .from('Auctions')
    .update({
      Bids: {
        ...auction.Bids,
        [userId]: newBid,
      },
    })
    .eq('id', auctionId)
    .single();
    res.redirect('/auction')
});
//periodic checks to update auction status
cron.schedule('*/2 * * * *', async () => {
  const { data: auctions, error } = await supabase
    .from('Auctions')
    .select('*')
    .eq('Available', true);
  if (error) {
    console.error('Error fetching auctions:', error);
    return;
  }
  const now = new Date();
  for (const auction of auctions) {
    const endTime = new Date(auction.Timeout);
    if (now >= endTime) {
      // Auction has ended, update status
      await supabase
        .from('Auctions')
        .update({ Available: false })
        .eq('id', auction.id);
      console.log(`Auction ${auction.id} has ended.`);
      // Check if there are any bids, if exists deduct cash from winner, if the winner has insufficient funds, the next highest bidder will be selected
      if (auction.Bids && Object.keys(auction.Bids).length > 0) {
        // Get the highest bid
        const highestBid = Object.values(auction.Bids).reduce((max, bid) => Math.max(max, bid.bid), 0);
        const highestBidder = Object.values(auction.Bids).find(bid => bid.bid === highestBid)?.bidder;
        if (highestBidder) {
          // Deduct cash from the highest bidder
          const { data: company, error: companyError } = await supabase
            .from('Companies')
            .select('Cash')
            .eq('user_id', highestBidder)
            .single();
          if (companyError || !company) {
            console.error('Error fetching company:', companyError);
            continue;
          }
          if (company.Cash >= highestBid) {
            await supabase
              .from('Companies')
              .update({ Cash: company.Cash - highestBid })
              .eq('user_id', highestBidder);
            console.log(`Deducted $${highestBid} from user ${highestBidder}'s account.`);
          } else {
            console.warn(`User ${highestBidder} has insufficient funds for the winning bid of $${highestBid}.`);
          }
        }
      }
    }
  }
});
app.get('/Addauction', checkAuth, (req, res) => {
  res.render('addauction');
});
  
//OTP generation -DONE
//This will run every 10 minutes for all users
// It generates a new OTP and sets an expiry time of 10 minutes from now
//Please set the timezone according to the server's timezone
cron.schedule('*/10 * * * *', () => {
  supabase.from('Companies').select('OTP, user_id').then(({ data, error }) => {
    if (error) {
      console.error('Error fetching companies:', error);
      return;
    }
    data.forEach(company => {
      const newOtp = Math.floor(1000 + Math.random() * 9000);
      const otpExpire = new Date(Date.now() + 10 * 60 * 1000 + 8*60*60*1000 ); // Set expiry to 10 min from now
      supabase.from('Companies').update({ OTP: newOtp, OTPexpire: otpExpire }).eq('user_id', company.user_id).then(({ error }) => {
        if (error) {
          console.error('Error updating OTP:', error);
        } else {
          console.log(`Updated OTP for user ${company.user_id}: ${newOtp}`);
        }
      });
    });
  }); 

});


// Logout -DONE
// User logout functionality
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
}); 



// Server start
// CHECK THIS BEFORE PRODUCTION Make sure to run it on a secure server and port forward for safety
// Might as well use vercel or something like that
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});