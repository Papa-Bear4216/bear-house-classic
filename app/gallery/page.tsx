import { Image as ImageIcon, Plus } from 'lucide-react';
import Image from 'next/image';

const PHOTOS = [
  { id: 1, url: 'https://picsum.photos/seed/bear1/800/600', caption: 'Kids at the park today! 🌳', date: 'Jul 24' },
  { id: 2, url: 'https://picsum.photos/seed/bear2/800/800', caption: 'Ice cream time 🍦', date: 'Jul 23' },
  { id: 3, url: 'https://picsum.photos/seed/bear3/600/800', caption: 'Movie night setup', date: 'Jul 22' },
  { id: 4, url: 'https://picsum.photos/seed/bear4/800/500', caption: 'Good morning from here!', date: 'Jul 21' },
  { id: 5, url: 'https://picsum.photos/seed/bear5/800/800', caption: 'Julia finished her book!', date: 'Jul 20' },
  { id: 6, url: 'https://picsum.photos/seed/bear6/600/800', caption: 'Abriana\'s new drawing 🎨', date: 'Jul 19' },
];

export default function GalleryPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 xl:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex justify-between items-end">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-pink-100 text-pink-600 rounded-xl">
              <ImageIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900">Family Gallery</h1>
              <p className="text-slate-500 mt-1">Updates for Mommy while she&apos;s in California until Aug 5th ❤️</p>
            </div>
          </div>
          
          <button className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            Upload Photo
          </button>
        </header>

        <button className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="w-5 h-5" />
          Upload Photo
        </button>

        {/* Masonry or Grid Gallery */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
          {PHOTOS.map(photo => (
            <div key={photo.id} className="break-inside-avoid relative group rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
              <Image 
                src={photo.url} 
                alt={photo.caption}
                width={800}
                height={600}
                className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pb-4 pt-20 px-4 flex flex-col justify-end">
                <p className="text-white font-medium drop-shadow-md">{photo.caption}</p>
                <p className="text-slate-300 text-xs mt-1 drop-shadow-md">{photo.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
