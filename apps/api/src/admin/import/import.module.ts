import { Module } from '@nestjs/common';
import { MediaModule } from '../../media/media.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { SpreadsheetParser } from './spreadsheet.parser';
import { ZipService } from './zip.service';

@Module({
  imports: [MediaModule],
  controllers: [ImportController],
  providers: [ImportService, SpreadsheetParser, ZipService],
  exports: [ImportService, SpreadsheetParser],
})
export class ImportModule {}
