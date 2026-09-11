import { IsDefined, IsMongoId, ValidateIf } from 'class-validator';

export class AssignTaskDto {
  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsMongoId()
  assigneeId: string | null;
}
