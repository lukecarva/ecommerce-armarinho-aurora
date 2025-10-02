import { Module } from '@nestjs/common';
import { ImageService } from './image.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, ImageService, StorageService],
  exports: [MediaService, ImageService, StorageService],
})
export class MediaModule {}
