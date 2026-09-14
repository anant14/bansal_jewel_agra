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
];
