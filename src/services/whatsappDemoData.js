'use strict';

/**
 * Sample conversations for the /whatsapp inbox preview. Not tied to the
 * real WhatsApp Business number — purely front-end demo data.
 */
module.exports = [
  {
    id: 'priya-sharma',
    name: 'Priya Sharma',
    status: 'online',
    unread: 2,
    messages: [
      { me: false, day: 'Yesterday', time: '11:14', text: 'Hi, is the Polki bridal necklace set (PJ-204) still available?' },
      { me: true, day: 'Yesterday', time: '11:20', text: 'Namaste Priya! Yes, it is available. Would you like the price and weight details?' },
      { me: false, day: 'Yesterday', time: '11:21', text: 'Yes please, and does it come with matching earrings?' },
      { me: true, day: 'Yesterday', time: '11:26', text: 'Yes, it comes as a full set with earrings and a maang tikka. I will share photos and pricing shortly.' },
      { me: false, day: 'Today', time: '09:02', text: 'Any update on the pricing?' },
      { me: false, day: 'Today', time: '09:03', text: 'Also, can we visit the showroom this weekend?' },
    ],
  },
  {
    id: 'rahul-verma',
    name: 'Rahul Verma',
    status: 'last seen today at 08:40',
    unread: 0,
    messages: [
      { me: false, day: 'Today', time: '08:31', text: 'Hello, I run a jewellery store in Lucknow. Interested in wholesale supply of gold bangles.' },
      { me: true, day: 'Today', time: '08:35', text: 'Hello Rahul, thank you for reaching out. Could you share the quantity and designs you are looking for?' },
      { me: false, day: 'Today', time: '08:38', text: 'Around 50 pieces to start, mixed traditional designs.' },
      { me: true, day: 'Today', time: '08:40', text: 'Understood. I will send our wholesale catalogue and rates over WhatsApp today.' },
    ],
  },
  {
    id: 'ananya-singh',
    name: 'Ananya Singh',
    status: 'typing…',
    unread: 1,
    messages: [
      { me: false, day: 'Today', time: '10:05', text: 'Hi, I would like to book a showroom appointment for this Saturday.' },
      { me: true, day: 'Today', time: '10:09', text: 'Sure Ananya, what time works best for you? We are open 10:30 AM – 8:30 PM.' },
      { me: false, day: 'Today', time: '10:11', text: 'Around 4 PM would be great.' },
    ],
  },
  {
    id: 'vikram-malhotra',
    name: 'Vikram Malhotra',
    status: 'last seen yesterday at 19:12',
    unread: 0,
    messages: [
      { me: false, day: 'Yesterday', time: '19:02', text: "Hello, I'd like to get a custom engagement ring made. Do you do bespoke orders?" },
      { me: true, day: 'Yesterday', time: '19:08', text: 'Absolutely — our bespoke atelier can design a custom piece for you. Do you have a design or stone preference in mind?' },
      { me: false, day: 'Yesterday', time: '19:10', text: 'Solitaire diamond, rose gold band. Can you share an estimate?' },
      { me: true, day: 'Yesterday', time: '19:12', text: 'Yes, please share the carat/budget range you have in mind and our team will get back with options.' },
    ],
  },
  {
    id: 'sanya-kapoor',
    name: 'Sanya Kapoor',
    status: 'last seen Monday at 12:47',
    unread: 0,
    messages: [
      { me: false, day: 'Monday', time: '12:40', text: 'Thank you so much for the beautiful earrings, they arrived safely!' },
      { me: true, day: 'Monday', time: '12:44', text: 'So happy to hear that, Sanya! It was a pleasure serving you. Do share photos if you wear them for an occasion 😊' },
      { me: false, day: 'Monday', time: '12:47', text: 'Will do! Definitely coming back for my sister\'s wedding shopping.' },
    ],
  },
  {
    id: 'meera-joshi',
    name: 'Meera Joshi',
    status: 'last seen today at 13:22',
    unread: 3,
    messages: [
      { me: false, day: 'Today', time: '13:10', text: 'Hi, I have some old gold jewellery I want to exchange for a new set. What is today\'s exchange rate?' },
      { me: true, day: 'Today', time: '13:15', text: 'Namaste Meera, today\'s 22K exchange rate is ₹7,180/gram after deductions. Please bring the pieces to our showroom for exact valuation.' },
      { me: false, day: 'Today', time: '13:18', text: 'Great, I have about 40 grams. Can I get an estimate before coming in?' },
      { me: false, day: 'Today', time: '13:20', text: 'Also, is there a making charge waiver on exchange?' },
      { me: false, day: 'Today', time: '13:22', text: 'Planning to visit tomorrow evening, is that okay?' },
    ],
  },
  {
    id: 'arjun-nair',
    name: 'Arjun Nair',
    status: 'online',
    unread: 0,
    messages: [
      { me: false, day: 'Today', time: '15:40', text: 'Hello, does the diamond set I bought last month come with an IGI certificate?' },
      { me: true, day: 'Today', time: '15:44', text: 'Yes Arjun, all our diamonds above 0.30ct are IGI certified. Your invoice number will have the certificate ID mentioned.' },
      { me: false, day: 'Today', time: '15:46', text: 'Perfect, I couldn\'t find the certificate copy. Can you resend it here?' },
      { me: true, day: 'Today', time: '15:50', text: 'Sure, please share your invoice number and I will send the certificate PDF right away.' },
    ],
  },
  {
    id: 'kavita-reddy',
    name: 'Kavita Reddy',
    status: 'last seen yesterday at 20:05',
    unread: 0,
    messages: [
      { me: false, day: 'Yesterday', time: '19:50', text: 'Hi, I had ordered a customised mangalsutra last week. Any update on when it will be ready?' },
      { me: true, day: 'Yesterday', time: '19:58', text: 'Hello Kavita, your piece is with our karigars and should be ready in 3-4 days. We will notify you here as soon as it\'s done.' },
      { me: false, day: 'Yesterday', time: '20:02', text: 'Thank you, please also let me know the final amount once ready.' },
      { me: true, day: 'Yesterday', time: '20:05', text: 'Absolutely, will share the final invoice with weight and making charges before delivery.' },
    ],
  },
  {
    id: 'rohan-gupta',
    name: 'Rohan Gupta',
    status: 'typing…',
    unread: 1,
    messages: [
      { me: false, day: 'Today', time: '17:12', text: 'Hi, I visited the showroom yesterday for a ring resizing but was told to come back today. Is the ring ready?' },
      { me: true, day: 'Today', time: '17:16', text: 'Apologies for the delay, Rohan. Let me check with our workshop and confirm in a few minutes.' },
      { me: false, day: 'Today', time: '17:20', text: 'Sure, please let me know soon, I need it for an event tonight.' },
    ],
  },
  {
    id: 'neha-agarwal',
    name: 'Neha Agarwal',
    status: 'last seen Sunday at 18:30',
    unread: 0,
    messages: [
      { me: false, day: 'Sunday', time: '18:15', text: 'Hi, looking for anniversary gift suggestions — budget around ₹1.5 lakh. Any recommendations?' },
      { me: true, day: 'Sunday', time: '18:22', text: 'Congratulations in advance, Neha! In that budget, a diamond pendant set or a Polki bangle pair would be lovely. Shall I share a few options?' },
      { me: false, day: 'Sunday', time: '18:25', text: 'Yes please, prefer something that can be worn daily too.' },
      { me: true, day: 'Sunday', time: '18:30', text: 'Noted — I will send a curated selection of everyday-wear diamond pieces within your budget shortly.' },
    ],
  },
];
