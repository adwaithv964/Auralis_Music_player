const mongoose = require('mongoose');
const fs = require('node:fs').promises;
const path = require('node:path');
const Track = require('./models/Track');
const Playlist = require('./models/Playlist');
const User = require('./models/User');

const dbFile = path.join(__dirname, 'data', 'music-db.json');
const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/auralis';

async function seed() {
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');

  try {
    const data = JSON.parse(await fs.readFile(dbFile, 'utf8'));
    
    // Clear existing
    await Track.deleteMany({});
    await Playlist.deleteMany({});
    await User.deleteMany({});

    // Seed Tracks
    if (data.tracks && data.tracks.length > 0) {
      await Track.insertMany(data.tracks);
      console.log(`Inserted ${data.tracks.length} tracks`);
    }

    // Seed Playlists
    if (data.playlists && data.playlists.length > 0) {
      await Playlist.insertMany(data.playlists);
      console.log(`Inserted ${data.playlists.length} playlists`);
    }

    // Seed User
    const user = new User({
      username: "defaultUser",
      favorites: data.favorites || [],
      history: data.history || [],
      library: data.library || {},
      preferences: data.preferences || {}
    });
    await user.save();
    console.log('Inserted default user data');
    
    console.log('Seeding complete!');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No music-db.json found, skipping seed.');
    } else {
      console.error('Error seeding data:', error);
    }
  }

  await mongoose.disconnect();
}

seed();
