import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import { BusinessProcess, BusinessProcessInput } from './business-process.model';
import { BusinessProcessesService } from './business-processes.service';

@Resolver(() => BusinessProcess)
export class BusinessProcessesResolver {
  constructor(private readonly service: BusinessProcessesService) {}

  @Query(() => [BusinessProcess])
  businessProcesses(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
  ): Promise<BusinessProcess[]> {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => BusinessProcess, { nullable: true })
  businessProcess(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
  ): Promise<BusinessProcess | undefined> {
    return this.service.findOne(principal, id);
  }

  @Mutation(() => BusinessProcess)
  createBusinessProcess(
    @CurrentUser() principal: Principal,
    @Args('input') input: BusinessProcessInput,
  ): Promise<BusinessProcess> {
    return this.service.create(principal, input);
  }

  @Mutation(() => BusinessProcess)
  updateBusinessProcess(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('input') input: BusinessProcessInput,
  ): Promise<BusinessProcess> {
    return this.service.update(principal, id, input);
  }

  @Mutation(() => Boolean)
  deleteBusinessProcess(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
  ): Promise<boolean> {
    return this.service.delete(principal, id);
  }

  // Stores the diagram and re-derives the process steps from its tasks.
  @Mutation(() => BusinessProcess)
  updateBusinessProcessDiagram(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('bpmnXml') bpmnXml: string,
  ): Promise<BusinessProcess> {
    return this.service.updateDiagram(principal, id, bpmnXml);
  }
}
