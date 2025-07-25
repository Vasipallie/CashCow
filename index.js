//inits
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import { time } from 'console';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cookieParser());
const supalink = ;
const supakey = ;

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
//only checks and displays the OTP for the user 
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


//business deals
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
  if (dealData.reject === true) {
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
  }else if (dealData.approved === true) {
    console.log(`Deal ${dealId} is still pending.`);
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


// Logout -DONE
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
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

// Server start
// CHECK THIS BEFORE PRODUCTION Make sure to run it on a secure server and port forward for safety
// Might as well use vercel or something like that
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});