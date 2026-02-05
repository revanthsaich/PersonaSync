import mongoose from 'mongoose';

let gfs = null;

export const initGridFS = (db) => {
  gfs = new mongoose.mongo.GridFSBucket(db, { bucketName: 'files' });
  console.log('✓ GridFS initialized');
};

export const getGridFS = () => {
  if (!gfs) {
    throw new Error('GridFS not initialized');
  }
  return gfs;
};

export const uploadToGridFS = async (filename, buffer, metadata = {}) => {
  const gfs = getGridFS();
  
  return new Promise((resolve, reject) => {
    const uploadStream = gfs.openUploadStream(filename, {
      metadata: {
        uploadedAt: new Date(),
        ...metadata,
      },
    });

    uploadStream.end(buffer);

    uploadStream.on('finish', () => {
      // Get file ID from the uploadStream
      resolve(uploadStream.id);
    });

    uploadStream.on('error', (err) => {
      reject(err);
    });
  });
};

export const downloadFromGridFS = async (fileId) => {
  const gfs = getGridFS();
  
  return new Promise((resolve, reject) => {
    const downloadStream = gfs.openDownloadStream(fileId);
    const chunks = [];

    downloadStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    downloadStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    downloadStream.on('error', (err) => {
      reject(err);
    });
  });
};

export const deleteFromGridFS = async (fileId) => {
  const gfs = getGridFS();
  return gfs.delete(fileId);
};
