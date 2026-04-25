"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Calendar as CalendarPrimitive,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  type CalendarProps as CalendarPrimitiveProps,
  type DateValue,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";

export function Calendar<T extends DateValue>({
  className,
  ...props
}: CalendarPrimitiveProps<T>) {
  const resolvedClassName =
    typeof className === "function" ? className(props as any) : className;
  return (
    <CalendarPrimitive
      className={twMerge("w-fit", resolvedClassName as unknown as string)}
      {...props}
    >
      <header className="flex items-center justify-between pb-4 px-1">
        <Button
          slot="previous"
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Heading className="font-semibold text-sm" />
        <Button
          slot="next"
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </header>
      <CalendarGrid className="border-collapse space-y-1">
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody className="space-y-1">
          {(date) => (
            <CalendarCell
              date={date}
              className={({
                isSelected,
                isHovered,
                isFocusVisible,
                isOutsideMonth,
              }) =>
                twMerge(
                  "h-9 w-9 text-center text-sm p-0 relative flex items-center justify-center rounded-md outline-none cursor-default",
                  isOutsideMonth
                    ? "text-muted-foreground opacity-50"
                    : "text-foreground",
                  isHovered && !isSelected && "bg-accent/50",
                  isSelected
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    : "",
                  isFocusVisible && "ring-2 ring-ring ring-offset-2"
                )
              }
            />
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </CalendarPrimitive>
  );
}
