 PicoLang - A Compiled high level language for the picoVM embeddedable virtual machine
=======================================================================================

This project provides a small high level compiler that targets the embeddedable virtual machine 
(https://github.com/harkal/picovm). 

Features
--------
* Clean and familiar, C like syntax
* Aims to have everything be an expression 
* Supports integers and floating point arithmetic
* Compiles to binary code, not interpreted
* Generics/templates support (take that Golang! :P)
* Inline assembly support

The compiler itself is coded in Javascript in order to be easily used by web apps and electron 
apps that configure programmable microcontrollers.

Having said that, the compiler is super-alpha™ code. The bulk of the code was written over a
weekend as a challenge to myself. For example error reporting is simply not there right now.
Of course, as I continue to work on it, I will get this updated. 

Example
-------

Ok, so what does it look like? Let's look at a classic example:

```C
//
// Fibonacci numbers
//

def fib(x) {
    if (x <= 1) {
        return  x
    } else {
        return fib(x-1) + fib(x-2)
    }
}

fib(6) 
```

In this example we define a procedure named `fib` that takes a parameter `x` and returns the `x`-th fibonacci number. Note that we don't provide a data type for `x`. This procedure is a template that PicoLang will use to generate a type specific procedure when the procedure is used. In this example it will be compiled down to machine code as if `x` was of integer type because of the call `fib(6)`.

Even though the above code would compile and run just fine, since in PicoLang everything is an expression we would probably write it in a more picolang-ie form:

```C++
//
// Fibonacci numbers
//

def fib(x)
    if x <= 1
        x
    else
        fib(x-1) + fib(x-2)
    
fib(6) 
```

Sweet!

A more elaborate example
------------------------

What if we want to draw the Mandelbrot set? Let's see the code:

```C++

def putc(ch) {
    __asm__ "LOAD32 [SFP + 4]"
    __asm__ "CALLUSER"
}

def pdensity(d) 
    if d > 32.0
        putc(32)  // ' '
    else if d > 16.0 
        putc(46) // '.'
    else if d > 8.0 
        putc(58) // ':'
    else if d > 4.0 
        putc(45) // '-'
    else if d > 2.0
        putc(61) // '='
    else if d > 1.0 
         putc(42) // '*'
    else if d > 0.5 
        putc(37) // '%'
    else
        putc(64) // '@'

def mandelconverge(real, imag, iters, creal, cimag) 
    if real*real + imag*imag > 4
        iters
    else if iters > 254
        iters
    else 
        mandelconverge(real*real - imag*imag + creal, 2*real*imag + cimag, iters+1, creal, cimag)

def mandelhelp(xmin, xmax, xstep, ymin, ymax, ystep)
{
    y = ymin
    while y < ymax {
        x = xmin
        while x < xmax {
            pdensity(mandelconverge(x, y, 0, x, y))
            x = x + xstep
        }
        putc(10)
        y = y + ystep
    }
}

def mand(realstart, imagstart, realmag, imagmag)
    mandelhelp(realstart, realstart+realmag*120, realmag, imagstart, imagstart+imagmag*40, imagmag)

mand(0-2.1, 0-1.3, 0.027, 0.067)

```

We compile and run the above code in PicoVM and we get this result:

```
@@@@@@@@@@@@@@@@@@@@@@%%%%%%%%%%%%%%%%%%%%%%%%%%%*********************%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@@@@@@%%%%%%%%%%%%%%%%%%%*****************************************%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@@@@%%%%%%%%%%%%%%%*********************************===========*********%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@@%%%%%%%%%%%%*******************************==========--:--==========*******%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@%%%%%%%%%%******************************==============--: :-----========********%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@%%%%%%%%******************************=================-----::.:---==========********%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@%%%%%%%*****************************==================-----:...::----===========*********%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@%%%%%*****************************==================----:: .     .::---============*********%%%%%%%%%%%%%%%%%%
@@@@@@@@@@%%%%****************************================----------..        .------===========*********%%%%%%%%%%%%%%%%
@@@@@@@@@%%%***************************===============----:-------::::       .::-----------.-====**********%%%%%%%%%%%%%%
@@@@@@@@%%%*************************===============----: ..: :::                 .  .---:-::--====***********%%%%%%%%%%%%
@@@@@@@%%************************================-------:.   .                        :    ::--====***********%%%%%%%%%%%
@@@@@@@%*********************=================-------:.:..                                .:---=====***********%%%%%%%%%%
@@@@@@%***************=======-----------------------:.                                    . ----=====***********%%%%%%%%%
@@@@@%*********=============---::------::----------.                                       . . --=====***********%%%%%%%%
@@@@@%****=================-----::..::::. :.::--:::                                         ::---=====************%%%%%%%
@@@@@***==================------::.           . :::.                                         ..-=======************%%%%%%
@@@@%*=================--:----::                 ..                                         .:--=======************%%%%%%
@@@@*==========-----------: :::.                                                            :--========************%%%%%%
@@@@===-----::--------::::.                                                               :----=========***********%%%%%%
@@@@====---------------::::                                                               .----=========***********%%%%%%
@@@@*===========----------::::::                  .                                         :--========************%%%%%%
@@@@%*==================------:...               :.                                          :--=======************%%%%%%
@@@@@***==================------:..  .       . ::::                                         .::--======***********%%%%%%%
@@@@@%*****================-----::..::::. ::::---:: .                                         ---=====************%%%%%%%
@@@@@@**********============---::-------:----------: :                                     :.:.--=====***********%%%%%%%%
@@@@@@%*****************======--------====----------..                                    ::----=====***********%%%%%%%%%
@@@@@@@%*********************==================-------::::.                                .---=====***********%%%%%%%%%%
@@@@@@@%%%***********************================-------:.   .                       .:    ..--====***********%%%%%%%%%%%
@@@@@@@@%%%**************************===============---:: ::.::.  .            . :  :-----: --====**********%%%%%%%%%%%%%
@@@@@@@@@%%%%***************************==============-------------::.        ::------------=====**********%%%%%%%%%%%%%%
@@@@@@@@@@%%%%%****************************===============----------..       .:-----===========**********%%%%%%%%%%%%%%%%
@@@@@@@@@@@%%%%%%*****************************==================---:..:.   ..:.---============*********%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@%%%%%%%******************************==================-----:: ::----===========********%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@%%%%%%%%******************************================-----::.::--=========********%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@%%%%%%%%%%*******************************=============--::-----=========*******%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@@@%%%%%%%%%%%%*******************************=========-:-:==========*******%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@@@@%%%%%%%%%%%%%%%%***********************************=====***********%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@@@@@@%%%%%%%%%%%%%%%%%%%%%**************************************%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
@@@@@@@@@@@@@@@@@@@@@@%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%**************%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

Executed 13518344 instructions
```

